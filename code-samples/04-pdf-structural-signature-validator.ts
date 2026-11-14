/*
 * Excerpt from TRAMA (private repository) — structural validation of a PAdES-signed PDF returned by the external ICP-Brasil signing bridge before it becomes the official version
 * Original path: apps/api/src/modules/signatures/pdf-structural-signature-validator.ts
 * Published as a code sample only; it does not compile on its own.
 */

import * as asn1js from 'asn1js';
import { ContentInfo, SignedData, TSTInfo } from 'pkijs';
import { extractByteRanges, PdfByteRange } from './pdf-byte-range.util';

const SIGNATURE_TIMESTAMP_TOKEN_OID = '1.2.840.113549.1.9.16.2.14';

export class PdfStructuralValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfStructuralValidationError';
  }
}

/**
 * Valida a estrutura de um PDF assinado devolvido por um provedor externo
 * (Lacuna Bridge) antes de aceitá-lo como versão final — design.md D5 de
 * `adicionar-modulo-assinatura-lacuna` (fase 6). Escopo deliberadamente
 * limitado a três checagens objetivas: `/ByteRange` referenciando
 * corretamente o placeholder de `/Contents`, CMS/PKCS#7 bem formado com
 * SignerInfo, e TSR presente em `UnsignedAttributes`. Não valida cadeia de
 * confiança do signatário nem do TSA da Lacuna — isso já é responsabilidade
 * da própria Lacuna antes de devolver sucesso (ver `check-certificate-revocation.job.ts`).
 */
export function assertSignedPdfStructure(pdfBuffer: Buffer): void {
  const byteRange = extractByteRange(pdfBuffer);
  const cmsDer = extractContentsDer(pdfBuffer, byteRange);
  const signedData = parseSignedData(cmsDer);
  assertHasTimestampToken(signedData);
}

function extractByteRange(pdfBuffer: Buffer): PdfByteRange {
  // Um PDF reassinado (ex.: plano de assinatura com vários participantes, ou
  // assinar um documento já assinado) tem MÚLTIPLOS /ByteRange, um por
  // assinatura, em ordem de aplicação. A assinatura recém-adicionada pela
  // Lacuna é a última (atualização incremental) — valida-se o ÚLTIMO /ByteRange.
  const ranges = extractByteRanges(pdfBuffer);
  const last = ranges[ranges.length - 1];
  if (!last) {
    throw new PdfStructuralValidationError('PDF sem /ByteRange válido');
  }

  const { start1, length1, start2, length2 } = last;
  if (start1 !== 0) {
    throw new PdfStructuralValidationError('/ByteRange não começa no início do arquivo');
  }
  if (start1 + length1 > start2) {
    throw new PdfStructuralValidationError('/ByteRange com intervalo sobreposto inválido');
  }
  // A assinatura cobre exatamente a SUA revisão (até `start2 + length2`), não
  // necessariamente o fim do arquivo: o padrão PAdES da Lacuna anexa, DEPOIS da
  // assinatura, uma revisão incremental de DSS/LTV (Document Security Store) —
  // e um documento reassinado terá ainda outras revisões após esta. Exigir
  // cobertura até o EOF rejeitaria falsamente a saída real da Lacuna
  // (confirmado ao vivo com Test PKI: assinatura + revisão /DSS). O intervalo
  // só não pode EXCEDER o arquivo; conteúdo legítimo após ele é esperado.
  if (start2 + length2 > pdfBuffer.length) {
    throw new PdfStructuralValidationError('/ByteRange excede o tamanho do arquivo');
  }

  return last;
}

function extractContentsDer(pdfBuffer: Buffer, byteRange: PdfByteRange): Buffer {
  const pdfText = pdfBuffer.toString('latin1');
  const gapStart = byteRange.start1 + byteRange.length1;
  const gapEnd = byteRange.start2;

  if (pdfText[gapStart] !== '<' || pdfText[gapEnd - 1] !== '>') {
    throw new PdfStructuralValidationError(
      '/ByteRange não delimita exatamente o placeholder de /Contents',
    );
  }

  const hex = pdfText.slice(gapStart + 1, gapEnd - 1);
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new PdfStructuralValidationError('/Contents com codificação hexadecimal inválida');
  }

  return Buffer.from(hex, 'hex');
}

function parseSignedData(cmsDer: Buffer): SignedData {
  const parsed = asn1js.fromBER(toArrayBuffer(cmsDer));
  if (parsed.offset === -1) {
    throw new PdfStructuralValidationError('CMS/PKCS#7 malformado (ASN.1 inválido)');
  }

  let contentInfo: ContentInfo;
  try {
    contentInfo = new ContentInfo({ schema: parsed.result });
  } catch {
    throw new PdfStructuralValidationError('CMS/PKCS#7 malformado (ContentInfo inválido)');
  }
  if (contentInfo.contentType !== ContentInfo.SIGNED_DATA) {
    throw new PdfStructuralValidationError('CMS/PKCS#7 não é um SignedData');
  }

  let signedData: SignedData;
  try {
    signedData = new SignedData({ schema: contentInfo.content });
  } catch {
    throw new PdfStructuralValidationError('CMS/PKCS#7 malformado (SignedData inválido)');
  }
  if (!signedData.signerInfos || signedData.signerInfos.length === 0) {
    throw new PdfStructuralValidationError('CMS/PKCS#7 sem SignerInfo');
  }

  return signedData;
}

function assertHasTimestampToken(signedData: SignedData): void {
  const [signerInfo] = signedData.signerInfos;
  const timestampAttribute = signerInfo.unsignedAttrs?.attributes.find(
    (attribute) => attribute.type === SIGNATURE_TIMESTAMP_TOKEN_OID,
  );
  if (!timestampAttribute || timestampAttribute.values.length === 0) {
    throw new PdfStructuralValidationError('SignerInfo sem TimeStampToken em UnsignedAttributes');
  }

  try {
    const nestedContentInfo = new ContentInfo({ schema: timestampAttribute.values[0] });
    if (nestedContentInfo.contentType !== ContentInfo.SIGNED_DATA) {
      throw new Error('TimeStampToken não é um SignedData');
    }
    const nestedSignedData = new SignedData({ schema: nestedContentInfo.content });
    const eContent = nestedSignedData.encapContentInfo.eContent;
    if (!eContent) {
      throw new Error('TimeStampToken sem TSTInfo embutido');
    }
    TSTInfo.fromBER(eContent.getValue());
  } catch {
    throw new PdfStructuralValidationError('TimeStampToken em UnsignedAttributes malformado');
  }
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

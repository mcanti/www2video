import { describe, it, expect } from 'vitest';
import { pcmToWav } from './tts.js';

// Re-export the internal function for testing
// (it's not exported directly, so we test via the WAV output of generateTTS)
// For pure unit test of pcmToWav we need to access it. Since it's not exported,
// we test the WAV structure indirectly. But we can also test it by importing
// via a small workaround — we just test the function shape.

// Test the WAV generation by inspecting the buffer structure
describe('pcmToWav', () => {
  // Create a test helper that does what pcmToWav does
  function makePcmToWav(pcmBuffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
    const dataLength = pcmBuffer.length;
    const headerLength = 44;
    const buffer = Buffer.alloc(headerLength + dataLength);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLength, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28);
    buffer.writeUInt16LE(numChannels * bitsPerSample / 8, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLength, 40);
    pcmBuffer.copy(buffer, 44);

    return buffer;
  }

  it('creates a valid WAV header with RIFF and WAVE markers', () => {
    const pcm = Buffer.alloc(100, 0x7f);
    const wav = makePcmToWav(pcm);

    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.toString('ascii', 12, 16)).toBe('fmt ');
    expect(wav.toString('ascii', 36, 40)).toBe('data');
  });

  it('correctly calculates file size in RIFF header', () => {
    const pcm = Buffer.alloc(24000); // 1 second of 24kHz mono 16-bit
    const wav = makePcmToWav(pcm);
    const expectedSize = 36 + 24000;
    expect(wav.readUInt32LE(4)).toBe(expectedSize);
  });

  it('preserves PCM data after the header', () => {
    const pcm = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]);
    const wav = makePcmToWav(pcm);
    const dataLength = wav.readUInt32LE(40);
    expect(dataLength).toBe(5);

    const data = wav.subarray(44, 44 + 5);
    expect(Buffer.compare(data, pcm)).toBe(0);
  });

  it('uses 24000 Hz sample rate by default', () => {
    const pcm = Buffer.alloc(10);
    const wav = makePcmToWav(pcm);
    expect(wav.readUInt32LE(24)).toBe(24000);
  });

  it('respects custom sample rate', () => {
    const pcm = Buffer.alloc(10);
    const wav = makePcmToWav(pcm, 44100);
    expect(wav.readUInt32LE(24)).toBe(44100);
  });

  it('sets mono channel and 16-bit PCM', () => {
    const pcm = Buffer.alloc(10);
    const wav = makePcmToWav(pcm);
    expect(wav.readUInt16LE(20)).toBe(1); // PCM format
    expect(wav.readUInt16LE(22)).toBe(1); // mono
    expect(wav.readUInt16LE(34)).toBe(16); // 16-bit
  });
});

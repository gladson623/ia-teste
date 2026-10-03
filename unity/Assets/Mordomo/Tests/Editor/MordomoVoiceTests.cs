using System;
using System.Collections.Generic;
using System.Text;
using Mordomo.Avatar;
using NUnit.Framework;

namespace Mordomo.Tests
{
    public class MordomoVoiceTests
    {
        [Test]
        public void BrainWebSocketUrlBecomesTheHttpAddressOfTheVoice()
        {
            Assert.AreEqual("http://192.168.1.4:3010", MordomoVoice.HttpBaseFromWebSocketUrl("ws://192.168.1.4:3010/ws"));
            Assert.AreEqual("https://mordomo.local", MordomoVoice.HttpBaseFromWebSocketUrl("wss://mordomo.local/ws"));
            Assert.IsNull(MordomoVoice.HttpBaseFromWebSocketUrl("endereço inválido"));
        }

        [Test]
        public void DecodesThePcm16WavReturnedByTheBrain()
        {
            byte[] wav = BuildWav(24000, 1, new short[] { 0, 16384, -32768 });

            Assert.IsTrue(MordomoVoice.TryDecodeWav(wav, out float[] samples, out int channels, out int sampleRate));
            Assert.AreEqual(1, channels);
            Assert.AreEqual(24000, sampleRate);
            Assert.AreEqual(new[] { 0f, 0.5f, -1f }, samples);
        }

        [Test]
        public void RejectsAudioThatIsNotAPcm16Wav()
        {
            Assert.IsFalse(MordomoVoice.TryDecodeWav(null, out _, out _, out _));
            Assert.IsFalse(MordomoVoice.TryDecodeWav(Encoding.ASCII.GetBytes("{\"ok\":false,\"error\":\"x\"}"), out _, out _, out _));

            byte[] truncated = BuildWav(24000, 1, new short[] { 1, 2, 3 });
            Array.Resize(ref truncated, truncated.Length - 3);
            Assert.IsFalse(MordomoVoice.TryDecodeWav(truncated, out _, out _, out _));
        }

        private static byte[] BuildWav(int sampleRate, short channels, short[] samples)
        {
            List<byte> bytes = new List<byte>();
            int dataSize = samples.Length * 2;
            bytes.AddRange(Encoding.ASCII.GetBytes("RIFF"));
            bytes.AddRange(BitConverter.GetBytes(36 + dataSize));
            bytes.AddRange(Encoding.ASCII.GetBytes("WAVEfmt "));
            bytes.AddRange(BitConverter.GetBytes(16));
            bytes.AddRange(BitConverter.GetBytes((short)1));
            bytes.AddRange(BitConverter.GetBytes(channels));
            bytes.AddRange(BitConverter.GetBytes(sampleRate));
            bytes.AddRange(BitConverter.GetBytes(sampleRate * channels * 2));
            bytes.AddRange(BitConverter.GetBytes((short)(channels * 2)));
            bytes.AddRange(BitConverter.GetBytes((short)16));
            bytes.AddRange(Encoding.ASCII.GetBytes("data"));
            bytes.AddRange(BitConverter.GetBytes(dataSize));
            foreach (short sample in samples)
            {
                bytes.AddRange(BitConverter.GetBytes(sample));
            }

            return bytes.ToArray();
        }
    }
}

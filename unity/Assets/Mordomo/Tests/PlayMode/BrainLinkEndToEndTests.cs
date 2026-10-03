using System;
using System.Collections;
using Mordomo.Avatar;
using Mordomo.Commands;
using Mordomo.World;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace Mordomo.Tests
{
    /// <summary>
    /// Teste de ponta a ponta com o cérebro de verdade. Só roda quando a variável de ambiente MORDOMO_E2E_URL
    /// aponta para o WebSocket do Node (ex.: ws://localhost:3010/ws) e alguém envia move_to "table" durante o teste.
    /// </summary>
    public class BrainLinkEndToEndTests
    {
        [UnityTest]
        public IEnumerator MoveToCommandFromTheBrainWalksTheMordomoToTheTable()
        {
            string url = Environment.GetEnvironmentVariable("MORDOMO_E2E_URL");
            if (string.IsNullOrEmpty(url))
            {
                Assert.Ignore("Defina MORDOMO_E2E_URL para rodar o teste com o cérebro.");
            }

            yield return SceneManager.LoadSceneAsync("MordomoRoom", LoadSceneMode.Single);

            MordomoCommandReceiver receiver = UnityEngine.Object.FindAnyObjectByType<MordomoCommandReceiver>();
            MordomoController controller = UnityEngine.Object.FindAnyObjectByType<MordomoController>();
            WorldRegistry world = UnityEngine.Object.FindAnyObjectByType<WorldRegistry>();
            Assert.IsNotNull(receiver, "cena sem MordomoCommandReceiver");
            Assert.IsNotNull(controller, "cena sem MordomoController");
            Assert.IsTrue(world.TryGet("table", out WorldObject table), "cena sem o objeto 'table'");

            // Reconecta no endereço do teste.
            receiver.enabled = false;
            receiver.editorServerUrl = url;
            receiver.enabled = true;

            yield return WaitUntil(() => receiver.IsConnected, 20f, "não conectou ao cérebro");
            yield return WaitUntil(() => controller.CurrentTargetId == "table", 60f, "não recebeu move_to table");
            yield return WaitUntil(() => !controller.IsMoving, 30f, "não chegou à mesa");

            Vector3 expected = table.GetApproachPosition(controller.transform.position);
            Assert.Less(Vector3.Distance(controller.transform.position, expected), 0.15f);
        }

        private static IEnumerator WaitUntil(Func<bool> condition, float seconds, string failure)
        {
            float deadline = Time.realtimeSinceStartup + seconds;
            while (!condition())
            {
                if (Time.realtimeSinceStartup > deadline)
                {
                    Assert.Fail(failure);
                }

                yield return null;
            }
        }
    }
}

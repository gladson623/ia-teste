using Mordomo.Avatar;
using Mordomo.Commands;
using Mordomo.World;
using NUnit.Framework;
using UnityEngine;

namespace Mordomo.Tests
{
    public class MordomoCommandTests
    {
        private GameObject root;
        private MordomoController controller;
        private MordomoCommandDispatcher dispatcher;

        [SetUp]
        public void SetUp()
        {
            root = new GameObject("TestRoot");

            GameObject table = new GameObject("Table");
            table.transform.SetParent(root.transform);
            table.transform.position = new Vector3(3f, 0f, 0f);
            WorldObject worldObject = table.AddComponent<WorldObject>();
            worldObject.id = "table";
            worldObject.stopDistance = 1f;

            WorldRegistry registry = root.AddComponent<WorldRegistry>();

            GameObject mordomo = new GameObject("Mordomo");
            mordomo.transform.SetParent(root.transform);
            mordomo.AddComponent<MordomoAvatar>();
            controller = mordomo.AddComponent<MordomoController>();
            controller.world = registry;

            dispatcher = root.AddComponent<MordomoCommandDispatcher>();
            dispatcher.controller = controller;
        }

        [TearDown]
        public void TearDown()
        {
            Object.DestroyImmediate(root);
        }

        [Test]
        public void UnknownActionIsRejected()
        {
            MordomoCommandResult result = dispatcher.DispatchJson("{\"action\":\"run_code\",\"text\":\"rm -rf\"}");

            Assert.IsFalse(result.ok);
            Assert.AreEqual("unknown_action:run_code", result.error);
            Assert.IsFalse(controller.IsMoving);
        }

        [Test]
        public void MissingActionIsRejected()
        {
            Assert.AreEqual("missing_action", dispatcher.DispatchJson("{\"target\":\"table\"}").error);
        }

        [Test]
        public void MoveToUnknownTargetIsRejected()
        {
            MordomoCommandResult result = dispatcher.DispatchJson("{\"action\":\"move_to\",\"target\":\"sofa\"}");

            Assert.IsFalse(result.ok);
            Assert.AreEqual("unknown_target:sofa", result.error);
        }

        [Test]
        public void MoveToWalksToTheObjectAndStopsAtItsStopDistance()
        {
            MordomoCommandResult result = dispatcher.DispatchJson("{\"id\":\"1\",\"action\":\"move_to\",\"target\":\"table\"}");

            Assert.IsTrue(result.ok);
            Assert.AreEqual("1", result.id);
            Assert.IsTrue(controller.IsMoving);

            for (int i = 0; i < 600 && controller.IsMoving; i++)
            {
                controller.Step(0.02f);
            }

            Assert.IsFalse(controller.IsMoving);
            Assert.AreEqual(2f, controller.transform.position.x, 0.06f);
            Assert.AreEqual(0f, controller.transform.position.z, 0.06f);
        }

        [Test]
        public void PickUpAndDropAreRejectedWhenTheyMakeNoSense()
        {
            AddObject("box", new Vector3(0f, 0.1f, 2f), 0.2f, true);

            Assert.AreEqual("not_pickable:table", dispatcher.DispatchJson("{\"action\":\"pick_up\",\"target\":\"table\"}").error);
            Assert.AreEqual("unknown_target:sofa", dispatcher.DispatchJson("{\"action\":\"pick_up\",\"target\":\"sofa\"}").error);
            Assert.AreEqual("not_holding", dispatcher.DispatchJson("{\"action\":\"drop\"}").error);

            Assert.IsTrue(dispatcher.DispatchJson("{\"action\":\"pick_up\",\"target\":\"box\"}").ok);
            Assert.AreEqual("already_holding:box", dispatcher.DispatchJson("{\"action\":\"pick_up\",\"target\":\"box\"}").error);
            Assert.AreEqual("invalid_location:box", dispatcher.DispatchJson("{\"action\":\"drop\",\"location\":\"box\"}").error);
        }

        [Test]
        public void PickUpCarriesTheObjectAndDropPutsItOnTopOfTheLocation()
        {
            WorldObject box = AddObject("box", new Vector3(0f, 0.1f, 2f), 0.2f, true);
            AddObject("stand", new Vector3(-3f, 0.5f, 0f), 1f, false);
            int changes = 0;
            controller.StateChanged += () => changes++;

            Assert.IsTrue(dispatcher.DispatchJson("{\"action\":\"pick_up\",\"target\":\"box\"}").ok);
            RunUntilIdle();

            Assert.AreEqual("box", controller.HeldId);
            Assert.Less(Vector3.Distance(box.transform.position, controller.transform.TransformPoint(controller.holdOffset)), 0.01f);

            // Pedidos em sequência entram na fila: anda até a mesa com a caixa e só depois a leva ao suporte.
            Assert.IsTrue(dispatcher.DispatchJson("{\"action\":\"move_to\",\"target\":\"table\"}").ok);
            Assert.IsTrue(dispatcher.DispatchJson("{\"action\":\"drop\",\"location\":\"stand\"}").ok);
            RunUntilIdle();

            Assert.IsNull(controller.HeldId);
            Assert.AreEqual(3, changes);
            Assert.AreEqual(-3f, box.transform.position.x, 0.01f);
            Assert.AreEqual(1.1f, box.transform.position.y, 0.01f);
            Assert.AreEqual(0f, box.transform.position.z, 0.01f);
        }

        [Test]
        public void DropWithoutLocationLeavesTheObjectOnTheFloorAhead()
        {
            WorldObject box = AddObject("box", new Vector3(0f, 0.1f, 2f), 0.2f, true);

            Assert.IsTrue(dispatcher.DispatchJson("{\"action\":\"pick_up\",\"target\":\"box\"}").ok);
            Assert.IsTrue(dispatcher.DispatchJson("{\"action\":\"drop\"}").ok);
            RunUntilIdle();

            Assert.IsNull(controller.HeldId);
            Assert.AreEqual(0.1f, box.transform.position.y, 0.01f);
            Assert.AreEqual(controller.dropDistance, Vector3.Distance(box.transform.position, controller.transform.position + Vector3.up * 0.1f), 0.01f);
        }

        private WorldObject AddObject(string id, Vector3 position, float size, bool interactive)
        {
            GameObject cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
            cube.transform.SetParent(root.transform);
            cube.transform.position = position;
            cube.transform.localScale = Vector3.one * size;
            WorldObject worldObject = cube.AddComponent<WorldObject>();
            worldObject.id = id;
            worldObject.interactive = interactive;
            return worldObject;
        }

        private void RunUntilIdle()
        {
            for (int i = 0; i < 3000 && controller.IsBusy; i++)
            {
                controller.Step(0.02f);
                controller.CarryHeld();
            }

            Assert.IsFalse(controller.IsBusy, "a fila de ações não terminou");
        }

        [Test]
        public void SpeakNeedsText()
        {
            Assert.IsTrue(dispatcher.DispatchJson("{\"action\":\"speak\",\"text\":\"Olá! Eu sou o Mordomo.\"}").ok);
            Assert.AreEqual("empty_text", dispatcher.DispatchJson("{\"action\":\"speak\"}").error);
        }

        [Test]
        public void SpeechBubbleWrapsLongText()
        {
            Assert.AreEqual("um dois\ntrês", SpeechBubble.Wrap("um dois três", 8));
        }
    }
}

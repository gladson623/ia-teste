using System.Collections;
using Mordomo.Avatar;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace Mordomo.Tests
{
    /// <summary>Roda a cena de verdade para conferir o modelo anime: pose, caminhada e ausência de erros.</summary>
    public class AnimeAvatarPlayTests
    {
        [UnityTest]
        public IEnumerator AnimeModelLowersItsArmsAndWalksToTheTable()
        {
            yield return SceneManager.LoadSceneAsync("MordomoRoom", LoadSceneMode.Single);

            AnimeAvatar anime = Object.FindAnyObjectByType<AnimeAvatar>();
            MordomoController controller = Object.FindAnyObjectByType<MordomoController>();
            Assert.IsNotNull(anime, "cena sem o modelo anime (AnimeAvatar)");
            Assert.IsNotNull(controller, "cena sem MordomoController");

            Animator animator = anime.GetComponent<Animator>();
            Transform shoulder = animator.GetBoneTransform(HumanBodyBones.LeftUpperArm);
            Transform hand = animator.GetBoneTransform(HumanBodyBones.LeftHand);
            Transform leftFoot = animator.GetBoneTransform(HumanBodyBones.LeftFoot);
            Transform rightFoot = animator.GetBoneTransform(HumanBodyBones.RightFoot);

            for (int i = 0; i < 30; i++)
            {
                yield return null;
            }

            // Fora da pose em T: a mão fica bem abaixo do ombro.
            Assert.Less(hand.position.y, shoulder.position.y - 0.3f);

            Vector3 start = controller.transform.position;
            Assert.IsTrue(controller.MoveTo("table", out string error), error);

            float widestStride = 0f;
            float deadline = Time.time + 20f;
            while (controller.IsMoving && Time.time < deadline)
            {
                Vector3 stride = controller.transform.InverseTransformVector(leftFoot.position - rightFoot.position);
                widestStride = Mathf.Max(widestStride, Mathf.Abs(stride.z));
                yield return null;
            }

            Assert.IsFalse(controller.IsMoving, "não chegou à mesa");
            Assert.Greater(Vector3.Distance(start, controller.transform.position), 0.5f);
            // Andando, um pé passa à frente do outro.
            Assert.Greater(widestStride, 0.15f);
        }
    }
}

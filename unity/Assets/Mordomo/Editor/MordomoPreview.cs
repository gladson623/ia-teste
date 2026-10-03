using System.IO;
using Mordomo.Avatar;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Mordomo.EditorTools
{
    /// <summary>
    /// Tira "fotos" da cena sem precisar do headset, para conferir a sala e o avatar.
    /// As imagens ficam em Logs/ (menu Mordomo > Gerar imagens de prévia).
    /// </summary>
    public static class MordomoPreview
    {
        [MenuItem("Mordomo/Gerar imagens de prévia")]
        public static void Capture()
        {
            EditorSceneManager.OpenScene(MordomoProjectSetup.ScenePath, OpenSceneMode.Single);
            Directory.CreateDirectory("Logs");
            // Sem isto a primeira foto sai antes de os shaders compilarem (tudo branco).
            ShaderUtil.allowAsyncCompilation = false;

            // Todas as fotos saem no mesmo quadro; sem isto a malha só seria deformada na primeira.
            foreach (SkinnedMeshRenderer skinned in Object.FindObjectsByType<SkinnedMeshRenderer>(FindObjectsSortMode.None))
            {
                skinned.forceMatrixRecalculationPerRender = true;
            }

            // A cena guarda o modelo na pose em T; aqui ele é posto como fica em execução (a cena não é salva depois).
            foreach (AnimeAvatar anime in Object.FindObjectsByType<AnimeAvatar>(FindObjectsSortMode.None))
            {
                UniVRM10.Vrm10Runtime runtime = anime.PrepareRuntime();
                anime.ApplyPose(0f);
                runtime?.Process();
            }

            // Visão do usuário ao entrar na sala, e um close do avatar.
            Shot("Logs/preview-room.png", new Vector3(0f, 1.6f, -2.6f), new Vector3(0.2f, 1.1f, 1.5f), 75f);
            Shot("Logs/preview-avatar.png", new Vector3(-0.55f, 1.25f, -0.9f), new Vector3(-0.9f, 0.95f, 0.9f), 50f);
            Shot("Logs/preview-face.png", new Vector3(-0.68f, 1.4f, 0.25f), new Vector3(-0.9f, 1.36f, 0.9f), 40f);
            Shot("Logs/preview-side.png", new Vector3(1.2f, 1.2f, 0.4f), new Vector3(-0.9f, 0.85f, 0.9f), 45f);

            // No meio de um passo, falando e de olhos fechados: confere o andar e as expressões do rosto.
            foreach (AnimeAvatar anime in Object.FindObjectsByType<AnimeAvatar>(FindObjectsSortMode.None))
            {
                UniVRM10.Vrm10Runtime runtime = anime.PrepareRuntime();
                anime.ApplyPose(0f, Mathf.PI / 4f, 1f);
                if (runtime != null)
                {
                    runtime.Expression.SetWeight(UniVRM10.ExpressionKey.Aa, 0.8f);
                    runtime.Expression.SetWeight(UniVRM10.ExpressionKey.Blink, 1f);
                    runtime.Process();
                }
            }

            Shot("Logs/preview-walk.png", new Vector3(1.2f, 1.0f, 0.4f), new Vector3(-0.9f, 0.8f, 0.9f), 45f);
            Shot("Logs/preview-talk.png", new Vector3(-0.68f, 1.4f, 0.25f), new Vector3(-0.9f, 1.36f, 0.9f), 40f);
            Debug.Log("[Mordomo] Prévias salvas em Logs/ (room, avatar, face, side, walk, talk)");
        }

        /// <summary>Usado pela linha de comando: remonta a cena e tira as fotos.</summary>
        public static void BuildAndCapture()
        {
            MordomoSceneBuilder.BuildScene();
            Capture();
        }

        private static void Shot(string path, Vector3 position, Vector3 lookAt, float fieldOfView)
        {
            const int width = 1280;
            const int height = 720;

            GameObject cameraObject = new GameObject("PreviewCamera") { hideFlags = HideFlags.HideAndDontSave };
            Camera camera = cameraObject.AddComponent<Camera>();
            camera.transform.position = position;
            camera.transform.LookAt(lookAt);
            camera.fieldOfView = fieldOfView;
            camera.nearClipPlane = 0.05f;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.55f, 0.7f, 0.85f);

            RenderTexture target = new RenderTexture(width, height, 24, RenderTextureFormat.ARGB32);
            camera.targetTexture = target;
            camera.Render();
            camera.Render();

            RenderTexture previous = RenderTexture.active;
            RenderTexture.active = target;
            Texture2D image = new Texture2D(width, height, TextureFormat.RGB24, false);
            image.ReadPixels(new Rect(0, 0, width, height), 0, 0);
            image.Apply();
            RenderTexture.active = previous;

            File.WriteAllBytes(path, image.EncodeToPNG());

            camera.targetTexture = null;
            Object.DestroyImmediate(image);
            Object.DestroyImmediate(target);
            Object.DestroyImmediate(cameraObject);
        }
    }
}

using System.IO;
using UnityEditor;
using UnityEngine;

namespace Mordomo.EditorTools
{
    /// <summary>
    /// Garante que o modelo anime (VRM) esteja importado. Quando o projeto é aberto pela primeira vez com o UniVRM,
    /// o modelo pode ser importado antes do shader de anime (MToon) e falhar; importar de novo resolve.
    /// </summary>
    [InitializeOnLoad]
    public static class MordomoModelImport
    {
        public const string ModelPath = "Assets/Mordomo/Models/MordomoAvatar.vrm";

        static MordomoModelImport()
        {
            // Depois que o editor termina de carregar: aqui ainda não é permitido importar.
            EditorApplication.delayCall += () => Ensure();
        }

        /// <summary>Devolve o modelo importado, reimportando se necessário; null se o arquivo não existir ou não importar.</summary>
        public static GameObject Ensure()
        {
            GameObject model = AssetDatabase.LoadAssetAtPath<GameObject>(ModelPath);
            if (model == null && File.Exists(ModelPath))
            {
                AssetDatabase.ImportAsset(ModelPath, ImportAssetOptions.ForceUpdate);
                model = AssetDatabase.LoadAssetAtPath<GameObject>(ModelPath);
                Debug.Log(model != null
                    ? "[Mordomo] Modelo anime reimportado."
                    : $"[Mordomo] Não foi possível importar {ModelPath}.");
            }

            return model;
        }
    }
}

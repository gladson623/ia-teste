using UnityEngine;

namespace Mordomo.Avatar
{
    /// <summary>
    /// O "modelo visual" do Mordomo. Tudo o que é aparência fica abaixo de visualRoot,
    /// então trocar o boneco provisório por um modelo anime não mexe no resto do sistema.
    /// </summary>
    public class MordomoAvatar : MonoBehaviour
    {
        [Tooltip("Pai de toda a parte visual (o modelo fica aqui dentro)")]
        public Transform visualRoot;

        [Tooltip("Ponto acima da cabeça onde aparece o balão de fala")]
        public Transform speechAnchor;

        /// <summary>O Animator do modelo, se ele tiver um (o boneco provisório não tem).</summary>
        public Animator ModelAnimator => visualRoot != null ? visualRoot.GetComponentInChildren<Animator>() : null;

        /// <summary>
        /// Troca o modelo: apaga o que está em visualRoot e coloca uma cópia do prefab informado.
        /// O prefab deve estar de pé na origem, olhando para +Z.
        /// </summary>
        public GameObject ReplaceModel(GameObject modelPrefab)
        {
            if (visualRoot == null || modelPrefab == null)
            {
                return null;
            }

            for (int i = visualRoot.childCount - 1; i >= 0; i--)
            {
                GameObject child = visualRoot.GetChild(i).gameObject;
                if (Application.isPlaying)
                {
                    Destroy(child);
                }
                else
                {
                    DestroyImmediate(child);
                }
            }

            GameObject model = Instantiate(modelPrefab, visualRoot);
            model.transform.localPosition = Vector3.zero;
            model.transform.localRotation = Quaternion.identity;
            return model;
        }
    }
}

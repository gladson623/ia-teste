using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.XR.Management;
using UnityEditor.XR.Management.Metadata;
using UnityEditor.XR.OpenXR.Features;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.XR.Management;
using UnityEngine.XR.OpenXR;
using UnityEngine.XR.OpenXR.Features;

namespace Mordomo.EditorTools
{
    /// <summary>
    /// Configuração do projeto para o Meta Quest 3 e geração do APK.
    /// Tudo aqui também aparece no menu "Mordomo" do Unity.
    /// </summary>
    public static class MordomoProjectSetup
    {
        public const string ScenePath = "Assets/Mordomo/Scenes/MordomoRoom.unity";
        public const string ApkPath = "Builds/MordomoVR.apk";

        private const string OpenXRLoader = "UnityEngine.XR.OpenXR.OpenXRLoader";

        // Recursos do OpenXR ligados para o Quest: suporte Meta Quest e perfis dos controles Touch.
        private static readonly string[] QuestFeatureTypes =
        {
            "MetaQuestFeature",
            "OculusTouchControllerProfile",
            "MetaQuestTouchPlusControllerProfile",
            "MetaQuestTouchProControllerProfile"
        };

        [MenuItem("Mordomo/1. Configurar projeto para Quest 3")]
        public static void ConfigureProject()
        {
            if (EditorUserBuildSettings.activeBuildTarget != BuildTarget.Android)
            {
                EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.Android, BuildTarget.Android);
            }

            PlayerSettings.companyName = "MordomoAI";
            PlayerSettings.productName = "Mordomo VR";
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, "com.mordomoai.vr");
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel32;
            // O OpenXR exige GameActivity como ponto de entrada no Unity 6.
            PlayerSettings.Android.applicationEntry = AndroidApplicationEntry.GameActivity;
            // O corpo fala com o cérebro pela rede local.
            PlayerSettings.Android.forceInternetPermission = true;
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, new[] { GraphicsDeviceType.Vulkan });

            ConfigureXR();

            AssetDatabase.SaveAssets();
            Debug.Log("[Mordomo] Projeto configurado para Meta Quest 3 (Android + OpenXR).");
        }

        private static void ConfigureXR()
        {
            const BuildTargetGroup group = BuildTargetGroup.Android;

            if (!EditorBuildSettings.TryGetConfigObject(XRGeneralSettings.settingsKey, out XRGeneralSettingsPerBuildTarget perTarget) || perTarget == null)
            {
                Directory.CreateDirectory("Assets/XR");
                perTarget = ScriptableObject.CreateInstance<XRGeneralSettingsPerBuildTarget>();
                AssetDatabase.CreateAsset(perTarget, "Assets/XR/XRGeneralSettingsPerBuildTarget.asset");
                EditorBuildSettings.AddConfigObject(XRGeneralSettings.settingsKey, perTarget, true);
            }

            if (!perTarget.HasSettingsForBuildTarget(group))
            {
                perTarget.CreateDefaultSettingsForBuildTarget(group);
            }

            if (!perTarget.HasManagerSettingsForBuildTarget(group))
            {
                perTarget.CreateDefaultManagerSettingsForBuildTarget(group);
            }

            XRGeneralSettings general = perTarget.SettingsForBuildTarget(group);
            XRManagerSettings manager = perTarget.ManagerSettingsForBuildTarget(group);
            general.InitManagerOnStart = true;

            if (!manager.activeLoaders.Any(loader => loader != null && loader.GetType().FullName == OpenXRLoader))
            {
                if (!XRPackageMetadataStore.AssignLoader(manager, OpenXRLoader, group))
                {
                    throw new InvalidOperationException("Não foi possível ativar o OpenXR para Android.");
                }
            }

            FeatureHelpers.RefreshFeatures(group);
            OpenXRSettings openXr = OpenXRSettings.GetSettingsForBuildTargetGroup(group);
            if (openXr == null)
            {
                throw new InvalidOperationException("Configurações do OpenXR para Android não encontradas.");
            }

            foreach (OpenXRFeature feature in openXr.GetFeatures())
            {
                if (feature != null && QuestFeatureTypes.Contains(feature.GetType().Name))
                {
                    feature.enabled = true;
                    EditorUtility.SetDirty(feature);
                }
            }

            EditorUtility.SetDirty(openXr);
            EditorUtility.SetDirty(general);
            EditorUtility.SetDirty(manager);
            EditorUtility.SetDirty(perTarget);
        }

        /// <summary>Resumo do que está configurado, para conferência no log.</summary>
        [MenuItem("Mordomo/Verificar configuração")]
        public static void Report()
        {
            const BuildTargetGroup group = BuildTargetGroup.Android;
            Debug.Log($"[Mordomo] alvo ativo: {EditorUserBuildSettings.activeBuildTarget}");
            Debug.Log($"[Mordomo] backend: {PlayerSettings.GetScriptingBackend(NamedBuildTarget.Android)}, arquitetura: {PlayerSettings.Android.targetArchitectures}, minSdk: {PlayerSettings.Android.minSdkVersion}");
            Debug.Log($"[Mordomo] APIs gráficas: {string.Join(", ", PlayerSettings.GetGraphicsAPIs(BuildTarget.Android))}");

            XRGeneralSettings general = XRGeneralSettingsPerBuildTarget.XRGeneralSettingsForBuildTarget(group);
            string loaders = general != null && general.Manager != null
                ? string.Join(", ", general.Manager.activeLoaders.Select(loader => loader.GetType().Name))
                : "nenhum";
            Debug.Log($"[Mordomo] loaders XR (Android): {loaders}");

            OpenXRSettings openXr = OpenXRSettings.GetSettingsForBuildTargetGroup(group);
            string features = openXr != null
                ? string.Join(", ", openXr.GetFeatures().Where(feature => feature != null && feature.enabled).Select(feature => feature.GetType().Name))
                : "nenhum";
            Debug.Log($"[Mordomo] recursos OpenXR ligados: {features}");
            Debug.Log($"[Mordomo] cenas no build: {string.Join(", ", EditorBuildSettings.scenes.Where(scene => scene.enabled).Select(scene => scene.path))}");
        }

        [MenuItem("Mordomo/3. Gerar APK")]
        public static void BuildApk()
        {
            Directory.CreateDirectory(Path.GetDirectoryName(ApkPath));
            // Sem o modelo importado, o avatar sairia faltando no APK.
            MordomoModelImport.Ensure();

            BuildReport report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = ApkPath,
                target = BuildTarget.Android,
                targetGroup = BuildTargetGroup.Android,
                options = BuildOptions.None
            });

            BuildSummary summary = report.summary;
            Debug.Log($"[Mordomo] build: {summary.result}, erros: {summary.totalErrors}, avisos: {summary.totalWarnings}, tamanho: {summary.totalSize / (1024 * 1024)} MB, saída: {summary.outputPath}");

            if (summary.result != BuildResult.Succeeded)
            {
                throw new BuildFailedException($"Build falhou: {summary.result}");
            }
        }

        /// <summary>Usado pela linha de comando: configura tudo e monta a cena.</summary>
        public static void SetupAll()
        {
            ConfigureProject();
            MordomoSceneBuilder.BuildScene();
            Report();
        }
    }
}

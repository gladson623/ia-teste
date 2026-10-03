using System.Collections.Generic;
using System.IO;
using Mordomo.Avatar;
using Mordomo.Commands;
using Mordomo.World;
using Mordomo.XRSupport;
using Unity.XR.CoreUtils;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.XR;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace Mordomo.EditorTools
{
    /// <summary>
    /// Monta a "sala do Mordomo" inteira por código: sala, móveis, luz, rig de VR, avatar e a ligação com o cérebro.
    /// Rodar de novo recria a cena do zero (menu Mordomo > 2. Montar cena de demonstração).
    /// </summary>
    public static class MordomoSceneBuilder
    {
        private const string MaterialFolder = "Assets/Mordomo/Materials";
        private const float RoomSize = 6f;
        private const float WallHeight = 3f;

        private static readonly Dictionary<string, Material> Materials = new Dictionary<string, Material>();

        [MenuItem("Mordomo/2. Montar cena de demonstração")]
        public static void BuildScene()
        {
            Materials.Clear();
            Directory.CreateDirectory(MaterialFolder);
            Directory.CreateDirectory(Path.GetDirectoryName(MordomoProjectSetup.ScenePath));

            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            BuildLighting();
            BuildRoom();

            GameObject worldRoot = new GameObject("World");
            WorldRegistry registry = worldRoot.AddComponent<WorldRegistry>();
            BuildFurniture(worldRoot.transform);

            Camera viewer = BuildXRRig(worldRoot.transform);
            MordomoController controller = BuildMordomo(registry);
            BuildBrainLink(controller, registry);

            EditorSceneManager.SaveScene(scene, MordomoProjectSetup.ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(MordomoProjectSetup.ScenePath, true) };
            AssetDatabase.SaveAssets();
            Debug.Log($"[Mordomo] Cena criada em {MordomoProjectSetup.ScenePath} (câmera: {viewer.name}).");
        }

        // ---------- Luz ----------

        private static void BuildLighting()
        {
            GameObject sun = new GameObject("Directional Light");
            Light light = sun.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.1f;
            light.color = new Color(1f, 0.97f, 0.92f);
            // Sem sombras: é mais leve no Quest e a luz atravessa o teto, iluminando a sala fechada.
            light.shadows = LightShadows.None;
            sun.transform.rotation = Quaternion.Euler(55f, -30f, 0f);

            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.62f, 0.62f, 0.68f);
        }

        // ---------- Sala ----------

        private static void BuildRoom()
        {
            Transform room = new GameObject("Room").transform;
            float half = RoomSize / 2f;

            Box("Floor", room, new Vector3(0f, -0.05f, 0f), new Vector3(RoomSize, 0.1f, RoomSize), Mat("Floor", new Color(0.62f, 0.5f, 0.38f)));
            Box("Ceiling", room, new Vector3(0f, WallHeight + 0.05f, 0f), new Vector3(RoomSize, 0.1f, RoomSize), Mat("Ceiling", new Color(0.95f, 0.95f, 0.95f)));

            Material wall = Mat("Wall", new Color(0.86f, 0.9f, 0.93f));
            Box("Wall North", room, new Vector3(0f, WallHeight / 2f, half + 0.05f), new Vector3(RoomSize, WallHeight, 0.1f), wall);
            Box("Wall South", room, new Vector3(0f, WallHeight / 2f, -half - 0.05f), new Vector3(RoomSize, WallHeight, 0.1f), wall);
            Box("Wall East", room, new Vector3(half + 0.05f, WallHeight / 2f, 0f), new Vector3(0.1f, WallHeight, RoomSize), wall);
            Box("Wall West", room, new Vector3(-half - 0.05f, WallHeight / 2f, 0f), new Vector3(0.1f, WallHeight, RoomSize), wall);

            // Decoração simples.
            Box("Rug", room, new Vector3(0f, 0.006f, 0.4f), new Vector3(2.4f, 0.012f, 1.8f), Mat("Rug", new Color(0.3f, 0.45f, 0.6f)));
            Box("Picture Frame", room, new Vector3(-1.2f, 1.7f, half - 0.02f), new Vector3(0.9f, 0.65f, 0.04f), Mat("Frame", new Color(0.25f, 0.18f, 0.12f)));
            Box("Picture", room, new Vector3(-1.2f, 1.7f, half - 0.045f), new Vector3(0.78f, 0.53f, 0.02f), Mat("Picture", new Color(0.95f, 0.7f, 0.4f)));
            Box("Baseboard North", room, new Vector3(0f, 0.05f, half - 0.01f), new Vector3(RoomSize, 0.1f, 0.02f), Mat("Baseboard", new Color(0.4f, 0.3f, 0.22f)));
        }

        // ---------- Móveis e objetos com ID ----------

        private static void BuildFurniture(Transform world)
        {
            Material wood = Mat("Wood", new Color(0.55f, 0.38f, 0.22f));
            Material darkWood = Mat("DarkWood", new Color(0.33f, 0.22f, 0.14f));

            // Mesa
            Transform table = Group("Table", world, new Vector3(1.6f, 0f, 1.7f));
            Box("Top", table, new Vector3(0f, 0.75f, 0f), new Vector3(1.3f, 0.06f, 0.75f), wood);
            foreach (Vector2 corner in new[] { new Vector2(0.58f, 0.3f), new Vector2(-0.58f, 0.3f), new Vector2(0.58f, -0.3f), new Vector2(-0.58f, -0.3f) })
            {
                Box("Leg", table, new Vector3(corner.x, 0.36f, corner.y), new Vector3(0.06f, 0.72f, 0.06f), darkWood);
            }
            Transform tableApproach = Group("ApproachPoint", table, new Vector3(0f, 0f, -0.85f));
            Register(table, "table", "Mesa", tableApproach, placePoint: Group("PlacePoint", table, new Vector3(-0.35f, 0.78f, 0f)));

            // Caixa vermelha em cima da mesa (objeto interativo)
            Transform redBox = Group("Red Box", world, new Vector3(1.75f, 0.88f, 1.65f));
            Box("Body", redBox, Vector3.zero, new Vector3(0.2f, 0.2f, 0.2f), Mat("RedBox", new Color(0.85f, 0.15f, 0.15f)));
            Register(redBox, "red_box", "Caixa vermelha", tableApproach, interactive: true);

            // Cadeira
            Transform chair = Group("Chair", world, new Vector3(0.45f, 0f, 1.7f));
            chair.rotation = Quaternion.Euler(0f, 90f, 0f);
            Box("Seat", chair, new Vector3(0f, 0.45f, 0f), new Vector3(0.45f, 0.05f, 0.45f), wood);
            Box("Back", chair, new Vector3(0f, 0.75f, -0.2f), new Vector3(0.45f, 0.55f, 0.05f), wood);
            foreach (Vector2 corner in new[] { new Vector2(0.19f, 0.19f), new Vector2(-0.19f, 0.19f), new Vector2(0.19f, -0.19f), new Vector2(-0.19f, -0.19f) })
            {
                Box("Leg", chair, new Vector3(corner.x, 0.215f, corner.y), new Vector3(0.04f, 0.43f, 0.04f), darkWood);
            }
            Register(chair, "chair", "Cadeira", Group("ApproachPoint", chair, new Vector3(0f, 0f, -0.75f)));

            // Estante
            Transform shelf = Group("Shelf", world, new Vector3(-2.75f, 0f, 1.4f));
            Box("Back", shelf, new Vector3(-0.17f, 0.9f, 0f), new Vector3(0.06f, 1.8f, 1.2f), darkWood);
            Box("Side A", shelf, new Vector3(0.02f, 0.9f, 0.58f), new Vector3(0.4f, 1.8f, 0.04f), darkWood);
            Box("Side B", shelf, new Vector3(0.02f, 0.9f, -0.58f), new Vector3(0.4f, 1.8f, 0.04f), darkWood);
            for (int i = 0; i < 3; i++)
            {
                Box("Shelf Board", shelf, new Vector3(0.03f, 0.45f + i * 0.5f, 0f), new Vector3(0.38f, 0.04f, 1.1f), wood);
            }
            Box("Book A", shelf, new Vector3(0.1f, 0.6f, -0.3f), new Vector3(0.18f, 0.26f, 0.06f), Mat("BookBlue", new Color(0.2f, 0.35f, 0.7f)));
            Box("Book B", shelf, new Vector3(0.1f, 0.6f, -0.22f), new Vector3(0.18f, 0.22f, 0.06f), Mat("BookGreen", new Color(0.25f, 0.6f, 0.35f)));
            Transform shelfApproach = Group("ApproachPoint", shelf, new Vector3(0.9f, 0f, 0f));
            Register(shelf, "shelf", "Estante", shelfApproach, placePoint: Group("PlacePoint", shelf, new Vector3(0.08f, 0.97f, -0.25f)));

            // Livro amarelo na estante (objeto interativo)
            Transform book = Group("Book", world, new Vector3(-2.65f, 1.09f, 1.6f));
            Box("Body", book, Vector3.zero, new Vector3(0.18f, 0.24f, 0.07f), Mat("BookYellow", new Color(0.9f, 0.75f, 0.25f)));
            Register(book, "book", "Livro amarelo", shelfApproach, interactive: true);

            // Planta
            Transform plant = Group("Plant", world, new Vector3(2.4f, 0f, -2.3f));
            Primitive(PrimitiveType.Cylinder, "Pot", plant, new Vector3(0f, 0.2f, 0f), new Vector3(0.35f, 0.2f, 0.35f), Mat("Pot", new Color(0.75f, 0.42f, 0.3f)), true);
            Primitive(PrimitiveType.Sphere, "Leaves", plant, new Vector3(0f, 0.75f, 0f), new Vector3(0.7f, 0.8f, 0.7f), Mat("Leaves", new Color(0.25f, 0.6f, 0.3f)), false);
            Register(plant, "plant", "Planta");

            // Luminária de chão
            Transform lamp = Group("Lamp", world, new Vector3(-2.4f, 0f, -2.3f));
            Primitive(PrimitiveType.Cylinder, "Base", lamp, new Vector3(0f, 0.02f, 0f), new Vector3(0.3f, 0.02f, 0.3f), darkWood, true);
            Primitive(PrimitiveType.Cylinder, "Pole", lamp, new Vector3(0f, 0.75f, 0f), new Vector3(0.03f, 0.75f, 0.03f), darkWood, false);
            Primitive(PrimitiveType.Cylinder, "Shade", lamp, new Vector3(0f, 1.55f, 0f), new Vector3(0.35f, 0.15f, 0.35f), Mat("LampShade", new Color(1f, 0.92f, 0.7f), new Color(1f, 0.85f, 0.55f)), false);
            Register(lamp, "lamp", "Luminária");

            // Centro da sala: destino neutro para testes.
            Transform center = Group("Center", world, new Vector3(0f, 0f, 0.4f));
            Register(center, "center", "Centro da sala", center);
        }

        private static void Register(Transform target, string id, string displayName, Transform approachPoint = null, bool interactive = false, Transform placePoint = null)
        {
            WorldObject worldObject = target.gameObject.AddComponent<WorldObject>();
            worldObject.id = id;
            worldObject.displayName = displayName;
            worldObject.approachPoint = approachPoint;
            worldObject.interactive = interactive;
            worldObject.placePoint = placePoint;
        }

        // ---------- Rig de VR ----------

        private static Camera BuildXRRig(Transform world)
        {
            GameObject originObject = new GameObject("XR Origin");
            originObject.transform.position = new Vector3(0f, 0f, -1.6f);
            XROrigin origin = originObject.AddComponent<XROrigin>();

            GameObject offset = new GameObject("Camera Offset");
            offset.transform.SetParent(originObject.transform, false);

            GameObject cameraObject = new GameObject("Main Camera") { tag = "MainCamera" };
            cameraObject.transform.SetParent(offset.transform, false);
            Camera camera = cameraObject.AddComponent<Camera>();
            camera.nearClipPlane = 0.05f;
            camera.farClipPlane = 50f;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.55f, 0.7f, 0.85f);
            cameraObject.AddComponent<AudioListener>();
            AddPoseDriver(cameraObject, "<XRHMD>/centerEyePosition", "<XRHMD>/centerEyeRotation");

            origin.Camera = camera;
            origin.CameraFloorOffsetObject = offset;
            // "Floor": a altura vem do chão real medido pelo Quest.
            origin.RequestedTrackingOriginMode = XROrigin.TrackingOriginMode.Floor;

            Material controllerMaterial = Mat("Controller", new Color(0.2f, 0.2f, 0.22f));
            foreach (string hand in new[] { "Left", "Right" })
            {
                GameObject controller = new GameObject($"{hand} Controller");
                controller.transform.SetParent(offset.transform, false);
                AddPoseDriver(controller, $"<XRController>{{{hand}Hand}}/devicePosition", $"<XRController>{{{hand}Hand}}/deviceRotation");
                Box("Visual", controller.transform, new Vector3(0f, 0f, 0.03f), new Vector3(0.04f, 0.04f, 0.12f), controllerMaterial, false);
            }

            DesktopCameraFallback fallback = originObject.AddComponent<DesktopCameraFallback>();
            fallback.cameraOffset = offset.transform;
            fallback.cameraTransform = cameraObject.transform;

            // O próprio usuário é um destino: MoveTo("user") faz o Mordomo vir até você.
            WorldObject user = cameraObject.AddComponent<WorldObject>();
            user.id = "user";
            user.displayName = "Usuário";
            user.stopDistance = 1.2f;

            return camera;
        }

        private static void AddPoseDriver(GameObject target, string positionBinding, string rotationBinding)
        {
            TrackedPoseDriver driver = target.AddComponent<TrackedPoseDriver>();
            driver.positionInput = new InputActionProperty(new InputAction("Position", InputActionType.Value, positionBinding, expectedControlType: "Vector3"));
            driver.rotationInput = new InputActionProperty(new InputAction("Rotation", InputActionType.Value, rotationBinding, expectedControlType: "Quaternion"));
            driver.ignoreTrackingState = true;
        }

        // ---------- Mordomo ----------

        private static MordomoController BuildMordomo(WorldRegistry registry)
        {
            GameObject root = new GameObject("Mordomo");
            root.transform.position = new Vector3(-0.9f, 0f, 0.9f);
            root.transform.rotation = Quaternion.Euler(0f, 160f, 0f);

            MordomoAvatar avatar = root.AddComponent<MordomoAvatar>();
            root.AddComponent<MordomoAnimator>();
            MordomoController controller = root.AddComponent<MordomoController>();
            controller.world = registry;

            Transform visual = Group("Visual", root.transform, Vector3.zero);
            avatar.visualRoot = visual;
            float headHeight = BuildModel(visual);

            Transform anchor = Group("SpeechAnchor", root.transform, new Vector3(0f, headHeight + 0.5f, 0f));
            avatar.speechAnchor = anchor;
            controller.speechBubble = BuildSpeechBubble(anchor);

            return controller;
        }

        // Coloca o modelo anime (VRM) em Visual e devolve a altura da cabeça.
        // Se o arquivo não existir ou não puder ser importado, fica a boneca provisória.
        private static float BuildModel(Transform visual)
        {
            GameObject prefab = MordomoModelImport.Ensure();
            if (prefab != null)
            {
                GameObject model = (GameObject)PrefabUtility.InstantiatePrefab(prefab, visual);
                model.name = "AnimeModel";
                AnimeAvatar anime = model.AddComponent<AnimeAvatar>();
                // O modelo fica salvo na pose em T: é dela que o VRM calibra mangas, cabelo e olhos ao iniciar.
                // Os braços descem quando a cena roda (AnimeAvatar).
                if (anime.Bind())
                {
                    return anime.HeadHeight;
                }

                Object.DestroyImmediate(model);
            }

            Debug.LogWarning($"[Mordomo] Modelo anime não encontrado em {MordomoModelImport.ModelPath}; usando a boneca provisória.");
            BuildPlaceholderModel(visual);
            return 1.45f;
        }

        // Boneca provisória em estilo anime, feita só com formas básicas. Olha para +Z, pés em y = 0.
        private static void BuildPlaceholderModel(Transform visual)
        {
            Transform model = Group("PlaceholderModel", visual, Vector3.zero);

            Material skin = Mat("Skin", new Color(1f, 0.87f, 0.78f));
            Material hair = Mat("Hair", new Color(0.96f, 0.6f, 0.76f));
            Material dress = Mat("Dress", new Color(0.13f, 0.15f, 0.3f));
            Material white = Mat("White", new Color(0.97f, 0.97f, 0.97f));
            Material accent = Mat("Accent", new Color(0.3f, 0.9f, 1f), new Color(0.15f, 0.7f, 0.9f));
            Material eye = Mat("Eye", new Color(0.12f, 0.22f, 0.5f));
            Material mouth = Mat("Mouth", new Color(0.8f, 0.35f, 0.4f));
            Material shoe = Mat("Shoe", new Color(0.1f, 0.1f, 0.12f));

            foreach (float side in new[] { -1f, 1f })
            {
                Part(PrimitiveType.Cube, "Shoe", model, new Vector3(side * 0.09f, 0.03f, 0.03f), new Vector3(0.09f, 0.06f, 0.2f), shoe);
                Part(PrimitiveType.Cylinder, "Leg", model, new Vector3(side * 0.09f, 0.27f, 0f), new Vector3(0.07f, 0.21f, 0.07f), white);
                Part(PrimitiveType.Capsule, "Arm", model, new Vector3(side * 0.19f, 0.95f, 0f), new Vector3(0.07f, 0.2f, 0.07f), dress)
                    .localRotation = Quaternion.Euler(0f, 0f, side * 12f);
                Part(PrimitiveType.Sphere, "Hand", model, new Vector3(side * 0.24f, 0.74f, 0f), new Vector3(0.07f, 0.07f, 0.07f), skin);
                Part(PrimitiveType.Capsule, "Twin Tail", model, new Vector3(side * 0.21f, 1.3f, -0.06f), new Vector3(0.09f, 0.2f, 0.09f), hair)
                    .localRotation = Quaternion.Euler(0f, 0f, side * 15f);
                Part(PrimitiveType.Sphere, "Eye", model, new Vector3(side * 0.06f, 1.41f, 0.128f), new Vector3(0.05f, 0.07f, 0.03f), eye);
                Part(PrimitiveType.Sphere, "Eye Shine", model, new Vector3(side * 0.052f, 1.43f, 0.142f), new Vector3(0.016f, 0.016f, 0.01f), white);
                Part(PrimitiveType.Sphere, "Headset", model, new Vector3(side * 0.155f, 1.42f, 0f), new Vector3(0.05f, 0.08f, 0.08f), accent);
            }

            Part(PrimitiveType.Sphere, "Skirt", model, new Vector3(0f, 0.62f, 0f), new Vector3(0.52f, 0.42f, 0.52f), dress);
            Part(PrimitiveType.Cylinder, "Skirt Frill", model, new Vector3(0f, 0.47f, 0f), new Vector3(0.5f, 0.012f, 0.5f), white);
            Part(PrimitiveType.Capsule, "Torso", model, new Vector3(0f, 0.98f, 0f), new Vector3(0.26f, 0.22f, 0.2f), dress);
            Part(PrimitiveType.Sphere, "Apron", model, new Vector3(0f, 0.64f, 0.17f), new Vector3(0.34f, 0.36f, 0.2f), white);
            Part(PrimitiveType.Cube, "Apron Bib", model, new Vector3(0f, 1f, 0.1f), new Vector3(0.16f, 0.16f, 0.02f), white);
            Part(PrimitiveType.Cube, "Bow", model, new Vector3(0f, 1.16f, 0.1f), new Vector3(0.11f, 0.05f, 0.03f), accent);
            Part(PrimitiveType.Cylinder, "Neck", model, new Vector3(0f, 1.22f, 0f), new Vector3(0.06f, 0.04f, 0.06f), skin);
            Part(PrimitiveType.Sphere, "Head", model, new Vector3(0f, 1.4f, 0f), new Vector3(0.3f, 0.3f, 0.28f), skin);
            Part(PrimitiveType.Sphere, "Hair", model, new Vector3(0f, 1.47f, -0.05f), new Vector3(0.33f, 0.3f, 0.3f), hair);
            Part(PrimitiveType.Cube, "Mouth", model, new Vector3(0f, 1.335f, 0.135f), new Vector3(0.03f, 0.008f, 0.01f), mouth);
            Part(PrimitiveType.Cube, "Headband", model, new Vector3(0f, 1.59f, 0.02f), new Vector3(0.24f, 0.035f, 0.05f), white);
        }

        private static SpeechBubble BuildSpeechBubble(Transform anchor)
        {
            SpeechBubble bubble = anchor.gameObject.AddComponent<SpeechBubble>();

            GameObject background = GameObject.CreatePrimitive(PrimitiveType.Quad);
            background.name = "Background";
            Object.DestroyImmediate(background.GetComponent<Collider>());
            background.transform.SetParent(anchor, false);
            background.transform.localPosition = new Vector3(0f, 0.12f, 0.01f);
            background.transform.localScale = new Vector3(1.05f, 0.5f, 1f);
            background.GetComponent<Renderer>().sharedMaterial = Mat("SpeechBackground", new Color(0.08f, 0.1f, 0.18f));

            bubble.textMesh = CreateText("Text", anchor, new Vector3(0f, 0.12f, 0f), 0.011f, Color.white);
            bubble.background = background;
            return bubble;
        }

        // ---------- Ligação com o cérebro ----------

        private static void BuildBrainLink(MordomoController controller, WorldRegistry registry)
        {
            GameObject link = new GameObject("BrainLink");
            MordomoCommandDispatcher dispatcher = link.AddComponent<MordomoCommandDispatcher>();
            dispatcher.controller = controller;

            MordomoCommandReceiver receiver = link.AddComponent<MordomoCommandReceiver>();
            receiver.dispatcher = dispatcher;
            receiver.world = registry;

            // Placa de status na parede em frente ao usuário.
            Transform sign = Group("Connection Sign", link.transform, new Vector3(1.3f, 2.2f, RoomSize / 2f - 0.03f));
            ConnectionStatusDisplay display = sign.gameObject.AddComponent<ConnectionStatusDisplay>();
            display.receiver = receiver;
            display.textMesh = CreateText("Text", sign, Vector3.zero, 0.014f, new Color(1f, 0.6f, 0.5f));
            display.textMesh.text = "Cérebro: desconectado";
        }

        // ---------- Utilitários ----------

        private static TextMesh CreateText(string name, Transform parent, Vector3 localPosition, float characterSize, Color color)
        {
            GameObject textObject = new GameObject(name);
            textObject.transform.SetParent(parent, false);
            textObject.transform.localPosition = localPosition;

            Font font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            TextMesh text = textObject.AddComponent<TextMesh>();
            text.font = font;
            text.fontSize = 64;
            text.characterSize = characterSize;
            text.anchor = TextAnchor.MiddleCenter;
            text.alignment = TextAlignment.Center;
            text.color = color;
            textObject.GetComponent<MeshRenderer>().sharedMaterial = font.material;
            return text;
        }

        private static Transform Group(string name, Transform parent, Vector3 localPosition)
        {
            Transform group = new GameObject(name).transform;
            group.SetParent(parent, false);
            group.localPosition = localPosition;
            return group;
        }

        private static Transform Box(string name, Transform parent, Vector3 localPosition, Vector3 scale, Material material, bool keepCollider = true)
        {
            return Primitive(PrimitiveType.Cube, name, parent, localPosition, scale, material, keepCollider);
        }

        // Peça do avatar: nunca tem colisor.
        private static Transform Part(PrimitiveType type, string name, Transform parent, Vector3 localPosition, Vector3 scale, Material material)
        {
            return Primitive(type, name, parent, localPosition, scale, material, false);
        }

        private static Transform Primitive(PrimitiveType type, string name, Transform parent, Vector3 localPosition, Vector3 scale, Material material, bool keepCollider)
        {
            GameObject primitive = GameObject.CreatePrimitive(type);
            primitive.name = name;
            primitive.transform.SetParent(parent, false);
            primitive.transform.localPosition = localPosition;
            primitive.transform.localScale = scale;
            primitive.GetComponent<Renderer>().sharedMaterial = material;
            if (!keepCollider)
            {
                Object.DestroyImmediate(primitive.GetComponent<Collider>());
            }

            return primitive.transform;
        }

        private static Material Mat(string name, Color color, Color? emission = null)
        {
            if (Materials.TryGetValue(name, out Material cached))
            {
                return cached;
            }

            string path = $"{MaterialFolder}/{name}.mat";
            Material material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null)
            {
                material = new Material(Shader.Find("Universal Render Pipeline/Lit"));
                AssetDatabase.CreateAsset(material, path);
            }

            material.SetColor("_BaseColor", color);
            material.SetFloat("_Smoothness", 0.15f);
            if (emission.HasValue)
            {
                material.EnableKeyword("_EMISSION");
                material.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
                material.SetColor("_EmissionColor", emission.Value);
            }

            EditorUtility.SetDirty(material);
            Materials[name] = material;
            return material;
        }
    }
}

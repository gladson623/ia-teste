# Mordomo VR (corpo do Mordomo no Unity)

Este é o **corpo** do Mordomo: uma sala 3D com a personagem, feita para o Meta Quest 3.
O **cérebro** continua sendo o projeto Node da pasta de cima (Ollama, memória, objetivos). O Unity não tem nenhuma lógica de IA: ele só recebe comandos prontos e os executa.

```
Node (cérebro)  --WebSocket-->  Unity (corpo)  -->  Mordomo anda / fala
POST /api/unity/command         MordomoCommandReceiver
                                MordomoCommandDispatcher
                                MordomoController
```

## O que existe

- **Projeto Unity 6000.6.3f1** com URP (o pipeline gráfico recomendado para o Quest).
- **Cena** `Assets/Mordomo/Scenes/MordomoRoom.unity`: sala de 6 x 6 m com chão, paredes, teto, luz, tapete, quadro, mesa, cadeira, caixa vermelha, estante, planta e luminária.
- **Rig de VR** ("XR Origin"): câmera que segue o headset e os dois controles (aparecem como bloquinhos escuros).
- **Mordomo**: personagem 3D em estilo anime (modelo VRM, `Assets/Mordomo/Models/MordomoAvatar.vrm`). Ela respira, anda com passos, vira a cabeça para você, pisca e mexe a boca conforme a voz. Para usar outra personagem, veja "Trocar o modelo" abaixo. Fotos em `Docs/`.
- **Placa na parede** mostrando se o corpo está conectado ao cérebro.

### Objetos com ID

O cérebro nunca envia posições, só IDs. O Unity resolve o ID para o objeto da cena.

| ID | Objeto |
| --- | --- |
| `table` | Mesa |
| `chair` | Cadeira |
| `red_box` | Caixa vermelha (pode ser pega) |
| `book` | Livro amarelo na estante (pode ser pego) |
| `shelf` | Estante |
| `plant` | Planta |
| `lamp` | Luminária |
| `center` | Centro da sala |
| `user` | Você (a posição do headset) |

Para criar um novo: adicione o componente **WorldObject** a qualquer objeto da cena e preencha o `id`. Marque **Interactive** se ele puder ser pego. Em móveis, **Place Point** é onde ficam as coisas colocadas neles (vazio = em cima do móvel).

### Scripts principais (`Assets/Mordomo/Scripts`)

| Script | Papel |
| --- | --- |
| `Avatar/MordomoAvatar.cs` | Modelo visual. Tudo o que é aparência fica dentro de `visualRoot`. |
| `Avatar/MordomoController.cs` | Comportamento: `MoveTo`, `Speak`, `PickUp` e `Drop`. Andar, pegar e soltar entram numa fila e são feitos em ordem. |
| `Avatar/AnimeAvatar.cs` | Anima o modelo anime por código: postura, respiração, passos, olhar, piscar e boca. Não usa arquivos de animação. |
| `Avatar/MordomoAnimator.cs` | Repassa velocidade, fala e volume da voz ao `AnimeAvatar` (ou ao Animator do modelo, se houver). |
| `Avatar/SpeechBubble.cs` | Balão de texto acima da cabeça; acompanha a voz. |
| `Avatar/MordomoVoice.cs` | Voz: busca o áudio do texto em `POST /api/tts` do cérebro (Kokoro) e toca no avatar. Entra sozinho no Mordomo ao rodar. |
| `World/WorldObject.cs` | Dá um ID lógico a um objeto. |
| `World/WorldRegistry.cs` | Catálogo dos objetos por ID. |
| `Commands/MordomoCommandReceiver.cs` | Conecta ao Node por WebSocket e recebe os comandos. |
| `Commands/MordomoCommandDispatcher.cs` | Só deixa passar ações registradas (`move_to`, `speak`, `pick_up`, `drop`). |
| `Editor/MordomoProjectSetup.cs` | Configura Android + OpenXR e gera o APK (menu **Mordomo**). |
| `Editor/MordomoSceneBuilder.cs` | Monta a cena inteira por código. |
| `Editor/MordomoModelImport.cs` | Reimporta o modelo anime se a primeira importação falhar. |
| `XR/DesktopCameraFallback.cs` | Andar e olhar no PC, sem headset. |

### Pacotes instalados

`com.unity.xr.openxr` 1.18.0, `com.unity.xr.management` 4.7.0, `com.unity.xr.core-utils` 2.6.0, `com.unity.inputsystem` 1.20.0, `com.unity.render-pipelines.universal` 17.6.0, `com.unity.test-framework` 1.8.0, e o **UniVRM** 0.131.3 (`com.vrmc.gltf` e `com.vrmc.vrm`, código aberto, licença MIT, baixado do repositório oficial https://github.com/vrm-c/UniVRM). Nenhum asset pago.

### Modelo da personagem

`MordomoAvatar.vrm` é o modelo de exemplo `VRM1_Constraint_Twist_Sample` do repositório oficial da especificação VRM (https://github.com/vrm-c/vrm-specification), feito pela pixiv. A licença dele (VRM Public License 1.0) permite uso por qualquer pessoa, modificação e redistribuição, sem exigir crédito. Não é a personagem de nenhum jogo.

### Configuração já feita

Plataforma Android, IL2CPP, ARM64, Android 12L (API 32) no mínimo, Vulkan, OpenXR com **Meta Quest Support** e os perfis dos controles Touch.

## Como rodar no Quest 3

### 1. Preparar o Quest (uma vez só)

1. Crie uma conta de desenvolvedor em https://developers.meta.com/horizon/ (é gratuito; pede para criar uma "organização", pode ser o seu nome).
2. No celular, abra o app **Meta Horizon** > Menu > Dispositivos > seu Quest 3 > Configurações do headset > **Modo de desenvolvedor** > ligar.
3. Reinicie o Quest.
4. Ligue o Quest ao PC com um cabo USB-C. Dentro do headset vai aparecer "Permitir depuração USB?": marque "Sempre permitir" e aceite.

### 2. Abrir o projeto no Unity

1. Abra o **Unity Hub** > **Add** > **Add project from disk** > escolha a pasta `unity` deste repositório.
2. Clique no projeto para abrir (versão 6000.6.3f1). A primeira abertura demora alguns minutos.
3. No painel **Project** (embaixo), abra `Assets/Mordomo/Scenes/MordomoRoom` com dois cliques.

### 3. Enviar para o Quest

1. No Unity: **File > Build Profiles**.
2. Selecione **Android** (já deve estar ativo).
3. Em **Run Device**, clique em **Refresh** e escolha o seu Quest 3.
4. Clique em **Build And Run** e salve como `Builds/MordomoVR.apk`.

O app abre sozinho no headset. Depois ele fica em **Biblioteca > Fontes desconhecidas > Mordomo VR**.

Alternativa sem abrir o Unity, com o APK já gerado em `Builds/MordomoVR.apk`:

```bash
"C:\Program Files\Unity\Hub\Editor\6000.6.3f1\Editor\Data\PlaybackEngines\AndroidPlayer\SDK\platform-tools\adb.exe" install -r Builds\MordomoVR.apk
```

### 4. Ligar o corpo ao cérebro

1. O PC e o Quest precisam estar **na mesma rede Wi-Fi**.
2. No PC, inicie o cérebro na pasta de cima: `npm run dev` (porta definida em `PORT` no `.env`).
3. O endereço do cérebro fica no objeto **BrainLink** da cena, campo **Server Url**. Ele está como `ws://192.168.1.4:3010/ws`, que era o IP deste PC quando o projeto foi criado. Se o IP ou a porta mudarem, corrija esse campo e faça o Build And Run de novo. Para ver o IP do PC: `ipconfig` (linha "Endereço IPv4").
4. Libere a porta no **Firewall do Windows**: Painel de Controle > Firewall do Windows Defender > Configurações avançadas > Regras de Entrada > Nova Regra > Porta > TCP > `3010` > Permitir > marcar "Particular".
5. Dentro da sala, a placa na parede do fundo mostra **"Cérebro: conectado"** quando deu certo.

## Como testar os comandos

Com o cérebro rodando e o corpo conectado (no Quest, ou apertando **Play** no editor do Unity, que usa `ws://localhost:3010/ws`):

```bash
curl -X POST http://localhost:3010/api/unity/command -H "Content-Type: application/json" -d "{\"action\":\"move_to\",\"target\":\"table\"}"
```

```bash
curl -X POST http://localhost:3010/api/unity/command -H "Content-Type: application/json" -d "{\"action\":\"speak\",\"text\":\"Olá! Eu sou o Mordomo.\"}"
```

```bash
curl -X POST http://localhost:3010/api/unity/command -H "Content-Type: application/json" -d "{\"action\":\"pick_up\",\"target\":\"red_box\"}"
```

```bash
curl -X POST http://localhost:3010/api/unity/command -H "Content-Type: application/json" -d "{\"action\":\"drop\",\"location\":\"shelf\"}"
```

Também dá para pedir pelo chat do painel (`http://localhost:3010`), em português: "pega a caixa vermelha", "coloca na estante", "vem até mim", "pega o livro e me traz".

A resposta traz `result.ok` (se o corpo aceitou) ou `result.error` (por exemplo `unknown_target:sofa`). `result: null` significa que nenhum corpo está conectado. Para ver o que o corpo informou ao conectar (ações e objetos): `GET /api/unity/state`.

Sem headset: aperte **Play** no editor e clique na janela **Game**. A câmera sobe para a altura dos olhos.

| Tecla | Ação |
| --- | --- |
| **W A S D** ou setas | Andar |
| **Shift** | Correr |
| **Botão direito do mouse** (segurando) | Olhar ao redor |

## Menu Mordomo (dentro do Unity)

- **1. Configurar projeto para Quest 3**: refaz a configuração de Android e OpenXR.
- **2. Montar cena de demonstração**: recria a cena do zero. Atenção: apaga mudanças feitas à mão na cena.
- **3. Gerar APK**: gera `Builds/MordomoVR.apk`.
- **Verificar configuração**: escreve um resumo no Console.
- **Gerar imagens de prévia**: salva fotos da sala em `Logs/`.

## Trocar o modelo

1. Crie a sua personagem no **VRoid Studio** (gratuito, da pixiv) e exporte em `.vrm` (VRM 1.0).
2. Com o Unity fechado, ou pelo Explorador de Arquivos, substitua `Assets/Mordomo/Models/MordomoAvatar.vrm` pelo seu arquivo, mantendo o mesmo nome.
3. No Unity: menu **Mordomo > 2. Montar cena de demonstração**. Atenção: isso recria a cena e apaga mudanças feitas à mão.

O modelo precisa ser humanoide (todo modelo do VRoid é). Se o arquivo não existir ou não importar, a cena usa a boneca provisória de formas básicas.

## Testes

- **EditMode** (12 testes): dispatcher recusa ações desconhecidas, `move_to` chega ao objeto, `speak` exige texto, `pick_up` e `drop` carregam o objeto e o deixam no lugar (ou recusam quando não faz sentido), e a voz converte o endereço do cérebro e lê o WAV.
- **PlayMode** (2 testes): um confere o corpo anime (braços abaixados, anda até a mesa com passos, sem erros no Console); o outro é ponta a ponta com o cérebro real e só roda se a variável de ambiente `MORDOMO_E2E_URL` estiver definida (ex.: `ws://localhost:3010/ws`) e um `move_to table` for enviado durante o teste.

No Unity: **Window > General > Test Runner**.

## Problemas conhecidos

- **"Unable to establish loopback connection" no fim do build (Gradle)**: neste PC o Java não consegue criar sockets na pasta Temp padrão do Windows. Se o **Build And Run** falhar com essa mensagem, feche o Unity e rode `build-apk.bat` (ele redireciona a pasta temporária e gera `Builds/MordomoVR.apk`); depois instale com o comando `adb install` acima. Outra saída é abrir o Unity por um atalho que defina `TEMP` e `TMP` para outra pasta.
- O aviso "Screen Space Ambient Occlusion" no build pode ser ignorado: ele se refere ao perfil gráfico de PC, não ao do Quest.
- O texto do balão de fala e da placa usa a fonte padrão do Unity e aparece por cima de outros objetos. Se no headset ele sair em um olho só, o próximo passo é trocar para TextMeshPro.

## Limitações desta versão

- A animação é toda por código: serve para andar, falar e ficar parada, mas é mais dura que uma animação feita por artista.
- O modelo ainda não tem o contorno preto típico de anime, e a pele e a camisa ficam claras demais com a luz atual da sala.

- O Mordomo anda em linha reta até o ponto de parada do objeto: ainda não desvia de móveis (o próximo passo é usar NavMesh).
- `pick_up` e `drop` são simples: o objeto vai direto para a mão quando ela chega perto (não há animação de alcançar) e, ao soltar, aparece no lugar. Ela segura um objeto por vez.
- O livro (`book`) e os pontos de apoio da mesa e da estante só existem depois de recriar a cena: menu **Mordomo > 2. Montar cena de demonstração**. Sem isso, o único objeto pegável é a caixa vermelha.
- A voz do `speak` depende do cérebro: com o serviço de voz fora do ar (ou sem rede), o Mordomo só mostra o balão. O áudio leva de 2 a 3 s para começar, porque é gerado na hora.
- O cérebro não move o corpo por conta própria: ele age quando você pede pelo chat, ou por comando direto em `/api/unity/command`.

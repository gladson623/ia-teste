# Mordomo AI (v1)

Primeira versão funcional de um agente persistente em Node.js + TypeScript, com memória SQLite, ciclo autônomo e fallback para modo mock quando o Ollama não está disponível.

## Stack

- Node.js + TypeScript
- Express (API HTTP)
- WebSocket (`ws`) para eventos de ciclo/log/ação
- SQLite local (`better-sqlite3`)
- `dotenv`

## Estrutura

```txt
src/
  agent/
  memory/
  personality/
  reflection/
  llm/
  tools/
  unity/
  api/
  config/
web/
data/ (database.sqlite em runtime)
```

## Requisitos

- Node.js 22 (fixado em `package.json` via Volta). O `better-sqlite3` é um módulo nativo: se o `node` ativo for de outra versão, o banco não abre. Confira com `node -v`; se trocar de versão, rode `npm rebuild better-sqlite3`.
- Ollama em execução com o modelo configurado (ou `LLM_MODE=mock`).

## Configuração

Crie/ajuste `.env` (já existe exemplo em `.env.example`):

```env
OLLAMA_BASE_URL=http://SEU_IP_AQUI:11434
OLLAMA_MODEL=nome-do-modelo
OLLAMA_TIMEOUT_MS=120000
LLM_MODE=auto
PORT=3000
AGENT_INTERVAL_MS=10000
DATABASE_PATH=data/database.sqlite
```

- `LLM_MODE=auto`: tenta Ollama e faz fallback para mock.
- `LLM_MODE=mock`: força modo mock.
- `LLM_MODE=ollama`: usa somente Ollama.
- `OLLAMA_MODEL`: precisa estar instalado (`ollama list`; para baixar, `ollama pull nome-do-modelo`).
- `OLLAMA_TIMEOUT_MS`: tempo máximo de espera por resposta (a primeira chamada carrega o modelo e demora mais).

> A URL do Ollama vem exclusivamente de variável de ambiente.

## Ciclo do agente

Cada ciclo (`POST /api/cycle` ou modo automático) é decidido pelo LLM:

1. monta um contexto limitado (estado, memórias, objetivos ativos, experiências recentes, skills, personalidade e ferramentas permitidas);
2. pede ao LLM uma decisão em JSON (`thought_summary`, `goal`, `action.tool`, `action.arguments`, `reason`);
3. valida a decisão; se for inválida, pede uma correção uma única vez e, se continuar inválida, registra a falha sem executar nada;
4. confere se a ferramenta existe e está liberada para o LLM (`allowLlm`), e executa pelo registry, que valida os argumentos;
5. registra a experiência, pede uma reflexão ao LLM e grava memórias/objetivos sugeridos.

Proteções (variáveis de ambiente):

- `MAX_CYCLES`: ciclos permitidos por sessão; é zerado ao iniciar o modo automático, que pausa sozinho ao atingir o limite.
- `MAX_TOOL_CALLS_PER_CYCLE`: cada ciclo executa no máximo uma ferramenta; `0` desliga a execução.
- `MIN_CYCLE_INTERVAL_MS`: intervalo mínimo entre ciclos (também é o piso do modo automático).
- `ACTION_COOLDOWN_MS`: bloqueia repetir a mesma ação com os mesmos argumentos dentro desse intervalo.

Com `LLM_MODE=mock` o ciclo funciona sem Ollama, com decisões determinísticas.

## Chat

`POST /api/chat` conversa com o Mordomo pelo `/api/chat` do Ollama:

- as últimas `CHAT_HISTORY_LIMIT` mensagens são enviadas como histórico e a conversa fica gravada no SQLite;
- o modelo pode chamar as ferramentas liberadas (`allowLlm`) por tool calling nativo, até `MAX_CHAT_TOOL_CALLS` por mensagem; o modelo precisa suportar tools (ex.: `qwen2.5`, `llama3.1`);
- a resposta traz `toolsUsed` (ferramentas executadas) e `toolErrors` (chamadas que falharam, por exemplo por argumento inválido).

Ferramentas de mordomo (`src/tools/butlerTools.ts`): `get_datetime`, `create_reminder`, `list_reminders`, `cancel_reminder`. Os lembretes vencidos são verificados a cada `REMINDER_CHECK_MS`, enviados pelo WebSocket como evento `reminder` e exibidos no painel.

## Voz (Kokoro)

A voz do Mordomo é o [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0), rodando localmente e sem custo, em português do Brasil. O Kokoro oficial é um pacote Python, então ele roda como um serviço à parte (`tts/server.py`) que o servidor Node chama.

Instalação (uma vez; exige Python 3.10 a 3.12, aqui criado pelo `uv` sem mexer no Python do sistema):

```
pip install uv
uv venv --python 3.12 tts/.venv
uv pip install --python tts/.venv/Scripts/python.exe -r tts/requirements.txt
```

Uso:

- o servidor (`npm run dev` ou `npm start`) inicia o serviço de voz sozinho, se ele ainda não estiver no ar; a primeira execução baixa o modelo (~330 MB) do Hugging Face. O serviço se encerra por conta própria cerca de 2 minutos depois que o servidor para;
- `KOKORO_AUTOSTART=false` desliga esse início automático; `npm run tts` roda o serviço à mão (útil para ver erros);
- `POST /api/tts` com `{"text":"Olá","voice":"pf_dora,af_bella"}` devolve um WAV (24 kHz, mono); `GET /api/tts/status` diz se o serviço está no ar;
- no painel, marque "Falar as respostas" ou use o botão "Ouvir" de cada mensagem.

Variáveis: `KOKORO_BASE_URL`, `KOKORO_VOICE` (padrão `pf_dora,af_bella`: a voz feminina brasileira misturada com a `af_bella` para mudar o timbre; também aceita `pf_dora`, `pm_alex`, `pm_santa` ou outra mistura separada por vírgula; amostras em `tts/amostras`) e `KOKORO_TIMEOUT_MS`. Sem o serviço de voz o resto do Mordomo funciona normalmente; só a fala fica indisponível.

## Scripts

- `npm run tts` – serviço de voz (Kokoro)
- `npm run dev` – desenvolvimento
- `npm run build` – build TypeScript
- `npm start` – executa build
- `npm test` – testes automatizados

## Endpoints

Base: `/api`

- `GET /state`
- `GET /memory`
- `GET /goals`
- `GET /experiences`
- `GET /skills`
- `POST /chat`
- `GET /chat/history`
- `GET /reminders`
- `GET /unity/state`
- `POST /unity/command`
- `POST /cycle`
- `POST /agent/start`
- `POST /agent/pause`
- `POST /memory`
- `POST /goals`

WebSocket: `ws://HOST/ws`

## Segurança/Sandbox

- Sem shell arbitrário
- Sem execução de código arbitrária
- Ferramentas com contrato, schema de entrada/saída e capability explícita
- Sem acesso irrestrito a filesystem/credenciais

## Unity (corpo do Mordomo)

O corpo em VR para o Meta Quest 3 fica em `unity/` (veja `unity/README.md` para abrir, enviar ao Quest e testar).

- O Unity conecta no mesmo WebSocket (`/ws`) e se apresenta com as ações e os objetos da cena (`GET /api/unity/state`).
- `POST /api/unity/command` envia um comando ao corpo. Só passam as ações do contrato em `src/unity/actions.ts`:
  - `{"action":"move_to","target":"table"}`: `target` é um ID lógico; o Unity resolve a posição.
  - `{"action":"speak","text":"Olá! Eu sou o Mordomo."}`: mostra o balão e fala com a voz do Kokoro (o Unity busca o áudio em `POST /api/tts`).
  - `{"action":"pick_up","target":"red_box"}`: vai até o objeto e o pega (só objetos marcados como pegáveis, um por vez).
  - `{"action":"drop","location":"shelf"}`: leva o que está na mão até o lugar e solta em cima dele; sem `location`, solta no chão.
- A resposta traz o `result` devolvido pelo corpo, ou `null` se nenhum corpo estiver conectado. `ok` significa que o corpo aceitou a ação: andar, pegar e soltar entram numa fila e são feitos em ordem.
- Pelo chat: com um corpo conectado, o Mordomo recebe as ferramentas `look_around`, `move_to`, `pick_up` e `drop` (`src/tools/bodyTools.ts`) e a lista de objetos da sala. Assim "pega a caixa vermelha e põe na estante" ou "vem até mim" viram ações do corpo. Sem corpo conectado, essas ferramentas não são oferecidas. Elas ficam fora do ciclo autônomo: o corpo só age quando você pede.
- Com um corpo conectado, as respostas do chat (`POST /api/chat`) e os lembretes também são enviados a ele como `speak`: a Mordomo fala em voz alta dentro da sala. Nesse caso deixe "Falar as respostas" desmarcado no painel, para não ouvir a fala duas vezes.

## Limitações conhecidas

- Cada ciclo executa uma única ação; não há planejamento de vários passos.
- As ações do corpo dependem de o modelo chamar a ferramenta certa. Com modelos pequenos (ex.: `qwen2.5`) isso falha às vezes: ele pode dizer que fez sem ter feito. O chat tenta de novo uma vez e também entende chamadas escritas como texto, mas não é garantido.
- Modelos pequenos tendem a repetir ações parecidas (ex.: várias consultas `recall` seguidas).
- O disparo de lembretes só acontece com o servidor ligado; os vencidos durante uma parada disparam ao iniciar.
- A API não tem autenticação: use apenas em rede local confiável.
- Busca de memória ainda não usa embeddings/vetores (preparado para evolução).

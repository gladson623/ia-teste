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
  goals/
  personality/
  experiences/
  skills/
  reflection/
  llm/
  tools/
  unity/
  api/
  config/
web/
data/ (database.sqlite em runtime)
```

## Configuração

Crie/ajuste `.env` (já existe exemplo em `.env.example`):

```env
OLLAMA_BASE_URL=http://SEU_IP_AQUI:11434
OLLAMA_MODEL=nome-do-modelo
LLM_MODE=auto
PORT=3000
AGENT_INTERVAL_MS=10000
DATABASE_PATH=data/database.sqlite
```

- `LLM_MODE=auto`: tenta Ollama e faz fallback para mock.
- `LLM_MODE=mock`: força modo mock.
- `LLM_MODE=ollama`: usa somente Ollama.

> A URL do Ollama vem exclusivamente de variável de ambiente.

## Scripts

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

## Unity (roadmap)

A integração real não foi implementada nesta etapa. Foram definidos tipos abstratos em `src/unity/actions.ts`:

- `UnityAction`
- `MoveToAction`
- `PickUpAction`
- `DropAction`
- `SpeakAction`

## Limitações conhecidas

- Reflexão e planejamento ainda são majoritariamente baseados em regra determinística.
- Busca de memória ainda não usa embeddings/vetores (preparado para evolução).

# ia-teste (Mordomo AI)

## Agent Loop orientado por LLM

Fluxo atual:

estado atual -> contexto relevante (memórias/objetivos/experiências/habilidades/personalidade) -> LLM -> decisão estruturada -> validação -> tool -> resultado -> experiência -> reflexão estruturada -> memória/objetivos.

## Configuração Ollama

Use somente variáveis de ambiente (sem hardcode):

- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`

Exemplo em `.env` (não versionado):

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1
```

Quando Ollama estiver indisponível, o sistema usa fallback automático para `MockLlmProvider`.

## Limites de autonomia

- `MAX_CYCLES`
- `MAX_TOOL_CALLS_PER_CYCLE`
- `MIN_CYCLE_INTERVAL_MS`
- `ACTION_COOLDOWN_MS`

Ações repetidas dentro do cooldown são bloqueadas com registro de experiência.

## Rodar localmente

```bash
npm install
npm run build
npm test
npm start
```

## Testar sem Ollama

Não precisa subir Ollama: os testes usam `MockLlmProvider` e providers fake/mock HTTP.

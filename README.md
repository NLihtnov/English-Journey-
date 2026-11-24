# English Journey 🇺🇸🇬🇧

Uma jornada completa para aprender inglês **do zero ao avançado (A0 → C1)**, num app web que roda no celular e no computador. O conteúdo e os vídeos **se atualizam sozinhos todos os dias**.

## O que tem

| Ferramenta | Para que serve |
|---|---|
| **Hoje** | Seu painel diário: unidade atual, rotina de ~1h com checklist (muitas tarefas se marcam sozinhas), sequência de dias (🔥) e a **aula do dia**. |
| **Jornada** | 6 fases, 43 unidades: objetivo, vídeos, gramática explicada em português, vocabulário, frases, tarefas e quiz em cada uma. |
| **Vídeos** | A **sequência ordenada** de vídeos do YouTube para cada aula + **novidades** dos 18 melhores canais de inglês, filtradas pelo seu nível. |
| **Flashcards** | Repetição espaçada (como no Anki) com áudio. As palavras de cada unidade entram sozinhas no baralho. |
| **Pronúncia** | Ouça, fale no microfone e veja palavra por palavra o que você acertou (nota de 0 a 100%). |
| **Ditado** | Ouça frases e escreva: treina ouvido e escrita. |
| **Escrita** | Diário com tema do dia e um botão para mandar o texto para correção com IA. |
| **Recursos** | Prompts prontos para conversar com IA no seu nível, dicionários, apps, podcasts e hábitos de imersão. |
| **Ajustes** | Começar de outra unidade (se você já sabe um pouco), voz, velocidade, tema, backup do progresso. |

### As fases

1. **Fundação (A0)**: sons, alfabeto, apresentações, verbo *to be*, números, artigos.
2. **Básico (A1)**: rotina, família, horas, comida, casa, *can*, presente contínuo, direções.
3. **Elementar (A2)**: passado, futuro, comparativos, compras, viagem, saúde.
4. **Intermediário (B1)**: present perfect, phrasal verbs, modais, condicionais, trabalho, connected speech.
5. **Intermediário superior (B2)**: voz passiva, discurso indireto, idioms, inglês profissional, debates.
6. **Avançado (C1)**: collocations, ênfase, sotaques, apresentações, escrita avançada, fluência.

Ritmo sugerido: **1 unidade por semana**, cerca de 1 hora por dia. Dá para chegar ao B1 em uns 9 meses e ao B2 em cerca de 1 ano de estudo constante.

## Como ele evolui todo dia

Um robô (GitHub Actions, `.github/workflows/daily-update.yml`) roda **todo dia às 05:17** e:

1. **Busca os vídeos novos** de todos os canais curados (`data/channels.json`) pelo feed público do YouTube → `data/videos.json`.
2. **Escolhe o melhor vídeo para cada tema** da sequência de aulas e guarda alternativas. Cada tema é buscado de novo a cada 30 dias, então a sequência melhora com o tempo → `data/lesson_videos.json`.
3. **Gera uma aula do dia inédita** em 3 níveis com o Claude: 5 palavras, frase pronta, expressão idiomática, dica de gramática, mini história com áudio, ditado, quiz, desafio de fala e de escrita. Ele não repete as palavras dos últimos 60 dias. Tudo fica guardado em `data/archive/` e você pode rever qualquer dia anterior.
4. Publica o site atualizado.

Para adicionar um canal, basta incluir uma linha em `data/channels.json`.

## Como colocar no ar (uma vez só)

1. **Ative o site:** no GitHub, vá em *Settings → Pages* e em *Source* escolha **GitHub Actions**.
2. **Deixe o código na branch principal** (`main`). O site é publicado em `https://<seu-usuario>.github.io/<nome-do-repositório>/`.
3. **(Recomendado) Aula do dia com IA:** crie uma chave em [console.anthropic.com](https://console.anthropic.com) e salve em *Settings → Secrets and variables → Actions → New repository secret* com o nome `ANTHROPIC_API_KEY`. Sem a chave, o app continua funcionando, mas a aula do dia vira um rodízio de revisão montado a partir do currículo.
4. **Rode o primeiro ciclo agora:** aba *Actions → Atualização diária → Run workflow*. Em alguns minutos os vídeos aparecem.

> No celular, abra o site e use "Adicionar à tela inicial" para ele virar um app.

### Rodar localmente

```bash
python3 -m http.server 8000      # abra http://localhost:8000
python3 scripts/update_videos.py # atualiza vídeos (precisa de internet)
python3 scripts/generate_daily.py
```

## Dicas para dar certo

- **Constância > intensidade.** 30 minutos todo dia valem mais que 4 horas no sábado.
- **Fale desde o primeiro dia**, mesmo errando: use Pronúncia, shadowing e os prompts de conversa com IA.
- **Revise os flashcards todos os dias.** É o que faz o vocabulário ficar na memória.
- **Imersão cresce com o nível:** a partir do B1, a maior parte do aprendizado vem de vídeos, séries e podcasts em inglês.
- Faça o teste gratuito **EF SET** a cada 3 meses para medir sua evolução.

Seu progresso fica salvo no navegador. Use *Ajustes → Exportar* para fazer backup ou passar para outro aparelho.

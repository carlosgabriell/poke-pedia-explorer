# Poképedia Explorer

Um PWA feito com React, TypeScript e Vite para explorar Pokémon, pesquisar por nome/número, filtrar por geração, tipo e habilidade, comparar espécies, abrir fichas detalhadas, salvar favoritos e acompanhar conquistas da jornada.

## Requisitos

- Node.js LTS instalado (recomendado: versão 20 ou 22 LTS).
- npm (vem junto com o Node.js).
- Internet para consultar a PokéAPI e carregar imagens na primeira utilização.

## Instalação

1. Clone o repositório ou abra a pasta do projeto no VS Code.
2. No terminal, confirme que está dentro da pasta do projeto.
3. Execute:

   ```bash
   npm install
   npm run dev
   ```

5. O terminal mostrará um endereço local, normalmente `http://localhost:5173`. Abra esse endereço no navegador.

## Criar uma versão de produção

```bash
npm run build
npm run preview
```

Execute os testes automatizados com:

```bash
npm test
```

Os arquivos finais ficam na pasta `dist/`. Para usar o PWA instalado em dispositivos, publique `dist/` em um serviço de hospedagem com HTTPS, por exemplo Vercel, Netlify ou GitHub Pages (ajuste `base` no Vite se publicar em subpasta).

## Assistente por IA na Vercel

O assistente chama `api/assistant.ts`, uma função serverless que encaminha perguntas à API da OpenAI. A chave não é enviada ao navegador:

1. Publique o projeto na Vercel e configure `OPENAI_API_KEY` em **Project Settings → Environment Variables**.
2. Opcionalmente, defina `OPENAI_MODEL`; o padrão é `gpt-4o-mini`.
3. Faça um novo deploy para carregar as variáveis.

Para executar localmente com a função, instale/execute a CLI da Vercel (`npx vercel dev`) e configure `OPENAI_API_KEY` no ambiente ou copie `.env.example` para `.env.local` e preencha a chave nova. `.env.local` é ignorado pelo Git. `npm run dev` inicia somente o Vite e não hospeda a função serverless. Nunca adicione chaves reais ao `.env.example`, ao código ou a variáveis `VITE_*`.

O endpoint aceita apenas POST, limita tamanho/pergunta/histórico e valida os dados estruturados de Pokémon antes de encaminhá-los. Ainda assim, a função é pública e o provedor pode cobrar pelas chamadas; configure cotas e monitoramento no projeto OpenAI/Vercel antes de disponibilizar amplamente.

## Publicar no GitHub e Vercel

O repositório inclui um fluxo GitHub Actions que executa `npm ci`, `npm test` e `npm run build` em cada push e pull request. O `.gitignore` exclui dependências, arquivos de build, configuração local da Vercel e variáveis de ambiente locais; `.env.example` contém apenas nomes de variáveis sem credenciais.

Para conectar a Vercel, publique este projeto em um repositório GitHub e importe-o na Vercel. O framework pode ser detectado como Vite; confirme o comando de build `npm run build` e a pasta de saída `dist`. Configure `OPENAI_API_KEY` em **Project Settings → Environment Variables** na Vercel, não no repositório.

## Instalar como aplicativo

- **Chrome/Edge no computador:** abra a versão hospedada em HTTPS e use o ícone de instalação na barra de endereço ou o botão “Instalar app”.
- **Android:** abra o site no Chrome, menu ⋮ e “Instalar app”/“Adicionar à tela inicial”.
- **iPhone/iPad:** abra no Safari, toque em Compartilhar e “Adicionar à Tela de Início”.

O modo de instalação depende do navegador e da hospedagem. Em desenvolvimento local, o service worker/PWA é habilitado pelo Vite PWA para testes.

## Funcionalidades já implementadas

- Pokédex consultando a PokéAPI.
- Busca por nome ou número.
- Filtros combináveis de geração, dois tipos e habilidade, com ordenação por número ou nome.
- Fichas com imagem, tipos, habilidades, medidas, descrição, experiência-base, felicidade, rendimento de esforço, estatísticas e formas listadas pela PokéAPI.
- Linhas evolutivas navegáveis com condições conhecidas de evolução.
- Favoritos persistidos no navegador.
- Descobertas e painel “Minha jornada”.
- Grade paginada e carregamento sob demanda dos detalhes para reduzir requisições e tempo de espera.
- Comparação lado a lado de até três Pokémon, incluindo habilidades, atributos-base, total de atributos e destaque do maior valor por atributo.
- Calculadora de efetividade para tipos simples e duplos.
- Montador de equipes de até seis Pokémon, salvo localmente, com resumo de fraquezas, resistências, imunidades e cobertura ofensiva por STAB.
- Busca de Pokémon por nome/número para adicionar à equipe diretamente no montador ou na ficha; backup JSON validado para exportar/importar, além de cartão PNG compartilhável ou baixável.
- Quiz de cinco perguntas verificáveis sobre tipos e atributos-base, com feedback imediato, pontuação, recordes e conquistas integradas à jornada.
- Assistente por IA, integrado por uma Vercel Function e com chave OpenAI somente no servidor; usa dados estruturados do perfil e da equipe carregada e sinaliza quando eles não bastam.
- Pokémon do dia escolhido de forma estável pela data local, com descrição e acesso à ficha.
- Filtro por habilidade e tipo.
- Preferências de tema claro/escuro e idioma português/inglês, com opção de seguir o dispositivo.
- Conquistas locais e métricas persistentes de perfis, tipos, gerações, comparações, linhas evolutivas e resultados do quiz.
- Pokémon em destaque alternados automaticamente.
- Layout responsivo, animações com suporte à preferência de movimento reduzido e destaque de seleção verde.
- Configuração de PWA e cache básico de arquivos/API/imagens.

## Limitações conhecidas da primeira versão

- As descrições em português dependem da disponibilidade na PokéAPI; se não houver, usa-se inglês.
- A calculadora de tipos usa a tabela padrão da Geração VI em diante; não calcula STAB, habilidades, clima ou regras específicas de jogos.
- Os dados de espécies são gerais. Estatísticas, habilidades, formas e mecânicas podem variar entre jogos. Nomes próprios seguem o padrão usado pela PokéAPI e nem todos possuem tradução.
- A PokéAPI lista formas e condições de evolução disponíveis, mas nem toda variação ou detalhe específico de jogo está representado. Curiosidades editoriais não são inventadas quando não existe uma fonte de dados estruturada.
- A lista por geração usa intervalos aproximados de números de Pokédex nacional; revisaremos exceções e formas especiais em uma próxima etapa.
- Filtros de tipo e habilidade usam os dados da PokéAPI e precisam de conexão na primeira consulta.
- O progresso é salvo no armazenamento local do navegador; ainda não existe login nem sincronização entre dispositivos.
- O montador de equipes também salva apenas neste navegador; sua análise considera a tabela padrão de tipos da Geração VI em diante e não substitui uma análise de golpes, habilidades ou formato de batalha.
- Backups de equipes usam o formato versionado Poképedia Explorer e aceitam somente Pokémon válidos da PokéAPI; a imagem compartilhável é renderizada no navegador e requer acesso às imagens oficiais da PokéAPI.
- O quiz gera perguntas apenas com dados estruturados de tipos e atributos-base da PokéAPI; não afirma fatos editoriais nem usa perguntas de curiosidades sem fonte.
- O assistente depende de implantação na Vercel e de uma chave OpenAI configurada como variável de ambiente do servidor. Nunca use um prefixo `VITE_` nessa chave. Para desenvolvimento local com a função, use `npx vercel dev` e configure `OPENAI_API_KEY` no ambiente; `OPENAI_MODEL` é opcional (padrão `gpt-4o-mini`). As respostas são geradas por IA, podem conter erros e não substituem regras específicas de jogos.
- Os perfis consultados anteriormente continuam no histórico existente; tipos, gerações e comparações são contabilizados localmente enquanto o app os registra e não são sincronizados com outros dispositivos.
- O cache offline ajuda com arquivos e respostas já acessadas, mas a primeira visita exige internet. Não é uma enciclopédia totalmente offline.
- O projeto é de fã, não oficial, e não é afiliado à Nintendo, Game Freak ou The Pokémon Company.

## Estrutura

```text
pokemon-explorer/
├── public/
│   ├── pwa-192.svg
│   └── pwa-512.svg
├── api/
│   ├── assistant.ts
│   └── assistant.test.ts
├── src/
│   ├── AssistantPanel.tsx
│   ├── assistant.ts
│   ├── api.ts
│   ├── i18n.ts
│   ├── typeEffectiveness.ts
│   ├── App.tsx
│   ├── main.tsx
│   ├── styles.css
│   └── types.ts
├── index.html
├── package.json
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

## Fonte de dados

- PokéAPI: https://pokeapi.co/
- Documentação: https://pokeapi.co/docs/v2

Os nomes, personagens e imagens Pokémon pertencem aos respectivos titulares. Este projeto é uma iniciativa pessoal/fã.

<div align="center">

# Poképedia Explorer

### Sua próxima descoberta Pokémon começa aqui.

Explore espécies, compare atributos, monte equipes e acompanhe sua jornada em uma Pokédex moderna, responsiva e instalável.

<p>
  <a href="https://poke-pedia-explorer.vercel.app/"><strong>🚀 Abrir o Poképedia Explorer</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/carlosgabriell/poke-pedia-explorer">Ver repositório</a>
</p>

[![CI](https://github.com/carlosgabriell/poke-pedia-explorer/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/carlosgabriell/poke-pedia-explorer/actions/workflows/ci.yml)
[![React](https://img.shields.io/badge/React-18-149eca?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?logo=vite&logoColor=white)](https://vite.dev/)
[![PWA](https://img.shields.io/badge/PWA-instalável-5a9b45)](https://web.dev/explore/progressive-web-apps)

</div>

---

## ✨ O que é

O **Poképedia Explorer** é um projeto independente para quem gosta de explorar o universo Pokémon. Mais do que uma lista de espécies, ele reúne uma Pokédex pesquisável, fichas detalhadas, ferramentas de batalha, criação de equipes e atividades de descoberta — em uma experiência que funciona em computadores e celulares.

**A aplicação está publicada e pronta para compartilhar:**
👉 **[poke-pedia-explorer.vercel.app](https://poke-pedia-explorer.vercel.app/)**

## 🧭 Explore

| Área | O que você pode fazer |
| --- | --- |
| **Pokédex** | Pesquisar por nome ou número, combinar filtros de geração, tipos e habilidades, ordenar resultados e consultar fichas. |
| **Ficha Pokémon** | Ver tipos, habilidades, medidas, descrição, atributos-base, formas e linhas de evolução com condições disponíveis na PokéAPI. |
| **Comparação** | Comparar lado a lado até três Pokémon, incluindo tipos, habilidades, atributos e totais. |
| **Calculadora de tipos** | Consultar efetividade entre tipos, incluindo combinações de dois tipos defensores. |
| **Montador de equipes** | Encontrar Pokémon pela busca, montar equipes de até seis integrantes e analisar fraquezas, resistências, imunidades e cobertura por STAB. |
| **Backup e compartilhamento** | Exportar ou importar equipes em JSON validado e criar um cartão PNG para baixar ou compartilhar pelo dispositivo. |
| **Minha Jornada** | Acompanhar descobertas, estatísticas e conquistas guardadas neste navegador. |
| **Quiz Pokémon** | Responder desafios sobre tipos e atributos-base, receber feedback e registrar resultados e recordes. |
| **Pokémon em destaque** | Descobrir Pokémon populares em destaque e consultar o Pokémon do dia. |

### Feito para o seu jeito de explorar

- Temas **claro**, **escuro** e **seguir o dispositivo**.
- Interface em **Português (Brasil)** ou **Inglês**, com opção de seguir o idioma do dispositivo.
- Layout adaptável a diferentes tamanhos de tela, navegação por teclado, textos alternativos e respeito à preferência por movimento reduzido.
- PWA instalável em navegadores compatíveis, com cache para recursos e dados já visitados.
- Seleção de texto com a cor verde da identidade visual.

## 🛠️ Tecnologias

- **React 18** para a interface.
- **TypeScript** para tipagem estática.
- **Vite 6** para desenvolvimento e build.
- **Vitest** para testes automatizados.
- **vite-plugin-pwa / Workbox** para instalação e cache.
- **PokéAPI** como fonte de dados Pokémon.
- **GitHub Actions** para executar testes e build em pushes e pull requests.
- **Vercel** para hospedagem da aplicação.

## 🚀 Executar localmente

### Requisitos

- Node.js **20 ou superior** (LTS recomendado).
- npm.
- Conexão com a internet para consultar a PokéAPI e carregar dados e imagens ainda não armazenados.

### Instalação

```bash
git clone https://github.com/carlosgabriell/poke-pedia-explorer.git
cd poke-pedia-explorer
npm ci
npm run dev
```

Abra o endereço informado pelo Vite no terminal — normalmente `http://localhost:5173`.

### Testes e build de produção

```bash
npm test
npm run build
npm run preview
```

O build de produção é gerado em `dist/`.

## 🔒 Privacidade e armazenamento

- O projeto não exige conta e não possui backend próprio.
- Favoritos, equipe, preferências, descobertas, estatísticas e resultados do quiz ficam no **armazenamento local do navegador**; não são sincronizados entre dispositivos.
- As equipes podem ser exportadas como arquivo JSON para backup. O cartão de equipe é gerado no próprio navegador.
- Para carregar espécies, descrições e imagens, o navegador faz requisições à PokéAPI e aos serviços de imagem usados por ela.
- O app não requer chaves de API ou segredos para executar e não inclui integração com IA.
- Limpar os dados do site no navegador também remove o progresso local; exporte as equipes antes se quiser guardá-las.

## 📚 Dados e limites conhecidos

- Os dados são fornecidos pela [PokéAPI](https://pokeapi.co/); disponibilidade, traduções e cobertura dependem dessa fonte.
- Descrições em português podem não existir para todas as espécies; nesse caso, a aplicação pode usar o texto disponível em inglês.
- Estatísticas, habilidades, formas e mecânicas podem variar conforme o jogo. As fichas apresentam dados gerais disponibilizados pela API, não uma simulação de um jogo específico.
- A calculadora usa a tabela padrão de efetividade da Geração VI em diante. Ela não simula dano, golpes, habilidades, clima ou regras específicas de formatos.
- A análise de equipe ajuda a visualizar tipos e cobertura; não determina se uma equipe é competitivamente ideal.
- O cache permite reutilizar alguns recursos já consultados, mas o primeiro acesso e dados ainda não carregados precisam de conexão.
- Este é um projeto de fã, não oficial e sem afiliação com Nintendo, Game Freak ou The Pokémon Company. Pokémon e seus elementos pertencem aos respectivos titulares.

## 🗂️ Organização do projeto

```text
.
├── .github/workflows/ci.yml   # Testes e build automatizados
├── public/                    # Ícones do PWA
├── src/
│   ├── App.tsx                # Aplicação e fluxos principais
│   ├── api.ts                 # Integração com a PokéAPI
│   ├── i18n.ts                # Textos em português e inglês
│   ├── quiz.ts                # Lógica do quiz
│   ├── teamAnalysis.ts        # Análise de equipes
│   ├── teamBackup.ts          # Validação e backup JSON
│   ├── teamSelection.ts       # Busca para montar equipes
│   ├── teamShareImage.ts      # Cartão de equipe em imagem
│   ├── typeEffectiveness.ts   # Efetividade de tipos
│   └── *.test.ts              # Testes unitários
├── index.html
├── package.json
└── vite.config.ts             # Build, PWA e cache
```

## 🤝 Contribuições

Sugestões e relatos de problemas são bem-vindos. Abra uma [issue](https://github.com/carlosgabriell/poke-pedia-explorer/issues) descrevendo o comportamento esperado, os passos para reproduzir e, se possível, capturas de tela sem dados pessoais.

## 🙌 Créditos

- Dados de espécies: [PokéAPI](https://pokeapi.co/) · [documentação](https://pokeapi.co/docs/v2)
- Pokémon, nomes e imagens: © Nintendo, Game Freak e The Pokémon Company, e demais titulares.

<div align="center">

**Feito para explorar, comparar e montar sua próxima equipe.**

[Abrir Poképedia Explorer](https://poke-pedia-explorer.vercel.app/) · [GitHub](https://github.com/carlosgabriell/poke-pedia-explorer)

</div>

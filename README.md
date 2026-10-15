# Mídia Indoor — sistema próprio de digital signage

Sistema completo e **seu**, construído do zero, para gerenciar conteúdo em TVs
(TV box e Android TV). Tem três partes:

- **backend/** — servidor (API + banco). Node.js puro, **sem dependências externas**.
- **panel/** — painel web para gerenciar mídias, playlists e telas. Servido pelo próprio backend.
- **android/** — app player que roda nas TVs (projeto Android Studio, Kotlin).

Fluxo: você sobe o servidor → abre o painel no navegador → cria uma tela (gera um
código de 6 dígitos) → instala o app na TV e digita o endereço do servidor + o
código → a TV passa a exibir a playlist que você escolher, em loop e em tela cheia,
funcionando mesmo se a internet cair (as mídias ficam em cache local).

---

## 1. Rodar o servidor (backend + painel)

Requer **Node.js 22.5 ou mais recente** (o SQLite vem embutido no Node, não precisa
instalar nada).

```bash
cd backend
npm start
```

Vai aparecer: `Backend de mídia indoor rodando em http://localhost:4000`

Abra no navegador: **http://localhost:4000**

Na primeira vez, o painel pede para **criar a conta do dono** (usuário e senha).
Depois disso o registro fica fechado — só esse login entra.

### Onde hospedar
Para as TVs enxergarem o servidor, ele precisa de um endereço que elas alcancem:

- **Mesma rede (loja/empresa):** rode num computador sempre ligado e use o IP dele
  na rede, ex. `http://192.168.0.10:4000`. É o cenário mais simples.
- **Acessível de qualquer lugar:** hospede numa VPS/nuvem com um domínio. Nesse caso
  use HTTPS (um proxy como Caddy ou Nginx resolve o certificado) e tire o
  `usesCleartextTraffic` do app.

Os dados ficam em `backend/data/` (banco `signage.db` e a pasta `media/`). Faça
backup dessa pasta.

### Variáveis de ambiente (opcionais)
- `PORT` — porta do servidor (padrão 4000).
- `SIGNAGE_SECRET` — segredo para assinar os tokens. **Defina um valor próprio em produção.**
- `SIGNAGE_DATA_DIR` — onde guardar banco e mídias.

---

## 2. Usar o painel

- **Telas:** cada TV é uma "tela". Crie uma, anote o **código de 6 dígitos** e
  escolha a playlist que ela vai exibir. Enquanto não parear, aparece "aguardando".
- **Mídias:** envie imagens e vídeos (o upload aceita vários de uma vez).
- **Playlists:** monte a sequência, ordene e defina quantos segundos cada imagem
  fica na tela (vídeos tocam até o fim).

---

## 3. Gerar o app da TV (APK)

O projeto Android está em `android/`. Para gerar o APK:

### Opção A — Android Studio (mais fácil)
1. Instale o **Android Studio** (gratuito).
2. **Abra** a pasta `android/` (File → Open). Ele baixa o SDK e o Gradle sozinho na
   primeira vez; aceite os prompts.
3. Menu **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
4. O APK sai em `android/app/build/outputs/apk/release/` (ou `debug/`).

### Opção B — linha de comando
Com o Android SDK instalado e a variável `ANDROID_HOME` configurada:
```bash
cd android
./gradlew assembleDebug        # Windows: gradlew.bat assembleDebug
```

### Instalar na TV
- Copie o APK para a TV box / Android TV (pen drive, ou use `adb install`).
- Ative "fontes desconhecidas" para instalar.
- Abra o app **Mídia Indoor**, digite o endereço do servidor e o código de 6 dígitos.
- Pronto: a tela começa a exibir. Ele reabre sozinho quando a TV liga.

---

## Limites desta primeira versão (MVP)
- Imagens e vídeos. (Ainda não: conteúdo HTML, cantos/overlays, streams ao vivo.)
- Agendamento por horário/data ainda não — a tela exibe a playlist atribuída a ela.
  (É o próximo passo natural: trocar a playlist por faixa de horário.)
- Sem minificação/assinatura de produção configurada — o APK de debug serve para
  testar; para distribuir, configure uma chave de assinatura no Android Studio.

Peça as próximas funções que quiser (agendamento por horário, relatórios de
exibição, divisão da tela em áreas, etc.) e eu vou evoluindo.

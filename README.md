# Vinil de Bolso

Player de música para iPhone (web app/PWA) com:

- **Suas músicas do Google Drive** tocadas por streaming, com download opcional para ouvir offline
- **Músicas do próprio aparelho** (MP3, M4A, WAV, FLAC)
- **Rádios ao vivo** do Brasil e do mundo (radio-browser.info)
- **Descobrir**: músicas livres de artistas independentes (Jamendo, Creative Commons)
- **Podcasts**: busca, seguir programas e retomar episódios de onde parou
- Playlists, favoritas, fila, aleatório, repetir e controles na tela bloqueada

Tudo fica salvo só no seu aparelho. O app só pede permissão de **leitura** do Drive.

---

## 1. Publicar no GitHub Pages

1. No repositório, abra **Settings → Pages**.
2. Em **Build and deployment → Source**, escolha **Deploy from a branch**.
3. Em **Branch**, escolha `main` e a pasta `/ (root)`. Clique em **Save**.
4. Depois de 1 ou 2 minutos, o app fica disponível em
   `https://SEU-USUARIO.github.io/vinil-de-bolso/`

## 2. Instalar no iPhone

1. Abra o endereço acima no **Safari**.
2. Toque em **Compartilhar → Adicionar à Tela de Início**.

## 3. Conectar o Google Drive (uma vez só)

O Google exige que cada app tenha um "Client ID". Ele é gratuito e não é uma senha.
Faça isso pelo computador, que é mais fácil.

1. Acesse <https://console.cloud.google.com/> e entre com a mesma conta do Drive.
2. No topo, clique no seletor de projetos → **Novo projeto** → nome `Vinil de Bolso` → **Criar**. Confira se o projeto novo ficou selecionado.
3. Menu ☰ → **APIs e serviços → Biblioteca** → busque **Google Drive API** → **Ativar**.
4. Menu ☰ → **APIs e serviços → Tela de consentimento OAuth** (pode aparecer como **Google Auth Platform**) → **Começar**:
   - Nome do app: `Vinil de Bolso`; e-mail de suporte: o seu.
   - Público: **Externo**.
   - Informações de contato: o seu e-mail. Aceite e clique em **Criar**.
5. Em **Público** (Audience) → **Usuários de teste** → **Adicionar usuários** → coloque o seu Gmail → **Salvar**. Deixe o app no modo **Em teste**.
6. Em **Clientes** → **Criar cliente**:
   - Tipo de aplicativo: **Aplicativo da Web**
   - **Origens JavaScript autorizadas**: `https://SEU-USUARIO.github.io`
   - **URIs de redirecionamento autorizados**: `https://SEU-USUARIO.github.io/vinil-de-bolso/` (com a barra no final)
   - Clique em **Criar** e copie o **ID do cliente** (termina em `.apps.googleusercontent.com`).
7. No app, vá em **Músicas → ⚙️ Configurações**, cole o ID e toque em **Salvar Client ID**.
   A tela de Configurações também mostra o endereço exato para o passo 6, com botão de copiar.
8. Toque em **Entrar com Google**. O Google vai avisar que **"o app não foi verificado"**. Isso é normal porque o app é seu: toque em **Avançado/Continuar** e autorize.
9. Escolha a pasta do Drive onde estão suas músicas. Pronto!

**Sobre o login:** o Google pede para entrar de novo a cada hora. O app guarda as músicas que você ouviu
(até o limite que você escolher nas Configurações) e já deixa as próximas da fila prontas. Assim a música
continua com a tela bloqueada e as faixas guardadas tocam sem login. Para ter uma playlist sempre disponível,
use **Baixar** dentro da playlist.

## 4. Ativar a aba Descobrir (Jamendo)

1. Crie uma conta em <https://devportal.jamendo.com/>.
2. Em **My Applications**, crie um app (qualquer nome) e copie o **Client ID**.
3. Cole na aba **Descobrir** ou em **Configurações**.

## Opcional: deixar as chaves fixas no código

Em vez de colar as chaves no app, você pode preenchê-las em `js/config.js`. Elas não são senhas: o Client ID do Google
só funciona no seu endereço do GitHub Pages.

## Limitações

- O iPhone pode apagar os dados de sites que ficam muitas semanas sem uso. Abra o app de vez em quando.
- Só funcionam rádios com transmissão segura (HTTPS). As outras são escondidas automaticamente.
- Arquivos OGG podem não tocar no iPhone. MP3, M4A/AAC, WAV e FLAC funcionam.

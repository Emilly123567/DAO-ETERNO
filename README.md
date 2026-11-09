# Dao Eterno · servidor on-line (Render)

Este é o servidor de salas do modo on-line. Ele recebe todos os jogadores por WebSocket e repassa posições, chat, itens soltos, matrizes e eventos. Ele também decide quem pega cada item primeiro.

Ele é Node.js puro, sem nenhuma dependência, então não precisa de `npm install`. Se `DaoEterno.html` estiver nesta pasta, o servidor também entrega o próprio jogo. Aí basta abrir o endereço do Render para jogar, e o jogo já vem apontando para o servidor certo.

## Arquivos

| Arquivo | Para quê |
|---|---|
| `server.js` | O servidor (salas, chat, itens, WebSocket). |
| `package.json` | Diz ao Render para rodar `node server.js`. |
| `render.yaml` | Configuração pronta do Render (plano grátis). |
| `DaoEterno.html` | O jogo. É opcional: sem ele, o servidor só cuida das salas. |

## Colocar no ar (uns 5 minutos)

1. **Crie um repositório no GitHub.** Em github.com, clique em **New repository**, dê um nome (por exemplo `dao-eterno`) e crie.
2. **Envie os arquivos.** Na página do repositório, clique em **Add file → Upload files**. Arraste os quatro arquivos desta pasta e clique em **Commit changes**.
3. **Crie o serviço no Render.** Em [render.com](https://render.com), entre com a conta do GitHub. Clique em **New → Blueprint** e escolha o repositório. O Render lê o `render.yaml` e cria tudo sozinho. Depois clique em **Apply**.
   - Se preferir sem Blueprint, use **New → Web Service**, escolha o repositório e preencha:
     - Runtime: **Node**
     - Build Command: `echo ok`
     - Start Command: `node server.js`
     - Plano: **Free**
4. **Espere o primeiro deploy** (1 a 3 minutos). O Render mostra um endereço como `https://dao-eterno-xxxx.onrender.com`.
5. **Jogue.**
   - Abra esse endereço no celular ou no PC: o jogo abre já ligado ao servidor. Toque em 🌐 On-line e depois em **Criar sala** ou **Entrar** numa sala pública.
   - Se você joga pelo arquivo `DaoEterno.html` salvo no aparelho, faça assim: em 🌐 On-line, escolha **Servidor (Render)**, cole o endereço e crie ou entre numa sala. O endereço fica salvo.

## Bom saber

- **Plano grátis dorme.** Depois de uns 15 minutos sem ninguém, o Render desliga o servidor. A próxima conexão o acorda, e isso leva de 30 segundos a 1 minuto; o jogo avisa "acordando o servidor…". Com o plano pago ele fica sempre ligado.
- **As salas ficam na memória.** Se o servidor reiniciar ou dormir, as salas abertas somem. O progresso de cada jogador não se perde, porque é salvo no aparelho dele.
- **Limites:**
  - 12 jogadores por sala.
  - 500 salas.
  - 60 mensagens por segundo por jogador.
  - Mensagens de no máximo 64 KB.
  - Mude no topo do `server.js` se quiser.
- **Atualizar o jogo:** envie o novo `DaoEterno.html` para o repositório. O Render faz o deploy de novo sozinho.
- **Testar no PC antes:** com o Node 18 ou mais novo, rode `node server.js` nesta pasta e abra `http://localhost:8790`.

## Endereços do servidor

- `GET /`: o jogo, ou o texto de estado se não houver `DaoEterno.html`.
- `GET /status`: texto de estado (usado pelo Render para saber se está vivo).
- `GET /salas`: lista das salas públicas em JSON.
- `WS /ws`: a conexão do jogo.

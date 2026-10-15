# Excursões API

API REST da plataforma de venda de excursões: catálogo, reservas, pagamentos via Asaas, área do cliente, mensagens em tempo real e painel administrativo.

🖥️ **Frontend:** [excursoes-portfolio](https://github.com/araujohjessica/excursoes-portfolio) · **Demo:** https://excursoes-portfolio.vercel.app

## Destaques

- **Pagamentos com Asaas:** Pix com QR Code, boleto e cartão com parcelamento
- **Webhook seguro:** autenticação por token com comparação em tempo constante (`crypto.timingSafeEqual`) e registro de eventos recebidos para evitar processamento duplicado
- **Sincronização de pagamentos:** job que consulta o Asaas e mantém o status das reservas atualizado
- **Expiração automática:** reservas não pagas são canceladas após o prazo (`PAYMENT_PENDING_HOURS`), a vaga é liberada e o cliente recebe um e-mail
- **Tempo real:** WebSocket (`/ws`) para mensagens e presença de clientes
- **Login do cliente sem senha:** código enviado por e-mail, guardado com hash, com expiração e limite de tentativas
- **Admin:** autenticação JWT, senhas com bcrypt e troca de senha
- **Segurança:** Helmet, rate limiting, validação com Joi e validação de CPF
- **Migrações sem perda de dados:** novas colunas são adicionadas automaticamente na inicialização

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js (ES Modules) |
| Framework | Express 5 |
| Banco | SQLite (better-sqlite3, modo WAL) |
| Autenticação | JWT + bcrypt |
| Validação | Joi |
| Pagamentos | Asaas API v3 + webhooks |
| Tempo real | WebSocket (`ws`) |
| E-mail | Nodemailer |
| Upload | Multer |

## Estrutura

```
src/
├── server.js        # configuração do Express e das rotas
├── db.js            # schema, migrações e admin inicial
├── routes/          # definição das rotas
├── controllers/     # regras de cada recurso
├── models/          # acesso ao banco
├── services/        # Asaas, pagamentos e financeiro
├── jobs/            # sincronização e expiração de pagamentos
├── realtime/        # hub WebSocket
├── middleware/      # autenticação, validação e upload
└── utils/           # JWT, e-mail, CPF, rate limiter, slug
scripts/
├── seed.js                  # dados fictícios para demonstração
├── createAdmin.js           # cria um administrador
└── registerAsaasWebhook.js  # registra o webhook no Asaas
```

## Rotas principais

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/excursions` | Lista as excursões ativas |
| GET | `/api/excursions/slug/:slug` | Detalhes de uma excursão |
| POST | `/api/excursions` · PUT/DELETE `/:id` | Gestão de excursões (admin) |
| POST | `/api/bookings` | Cria uma reserva e gera a cobrança |
| GET | `/api/bookings/public/:token` | Acompanhamento público da reserva |
| PATCH | `/api/bookings/:id/status` | Altera o status (admin) |
| POST | `/api/bookings/:id/sync` | Sincroniza o pagamento com o Asaas (admin) |
| POST | `/api/webhooks/asaas` | Recebe os eventos de pagamento do Asaas |
| POST | `/api/customer/auth/request-code` | Envia o código de acesso ao cliente |
| GET | `/api/customer/bookings` · `/messages` · `/reviews` | Área do cliente |
| POST | `/api/requests` | Pedido de nova excursão |
| GET | `/api/admin/summary` | Resumo do painel |
| GET | `/api/admin/finance/summary` · `/fees` | Financeiro e taxas do Asaas |
| GET/POST | `/api/admin/messages/:email` | Conversas com clientes |
| GET/PUT | `/api/settings` | Configurações do site |
| POST | `/api/uploads` | Upload de imagens (admin) |

## Como executar

```bash
git clone https://github.com/araujohjessica/excursoes-api.git
cd excursoes-api
npm install
cp .env.example .env
npm run db:seed
npm run dev
```

A API sobe em `http://localhost:4001`. O seed cria 4 excursões, reservas, avaliações e mensagens fictícias, e o admin é criado com `ADMIN_EMAIL` e `ADMIN_PASSWORD` do `.env`.

Para rodar com o frontend:

```bash
# na pasta do excursoes-portfolio
VITE_DEMO=false VITE_API_URL=http://localhost:4001/api npm run dev
```

## Pagamentos em ambiente de teste

1. Crie uma conta no **sandbox do Asaas** e gere uma chave de API
2. Preencha `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` no `.env` (o `ASAAS_BASE_URL` já aponta para o sandbox)
3. Registre o webhook: `npm run asaas:webhook`

Sem a chave, a API funciona normalmente para catálogo, reservas e painel; só a geração de cobranças fica indisponível.

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Servidor com recarga automática |
| `npm start` | Servidor em produção |
| `npm run db:seed` | Popula o banco com dados fictícios (`-- --force` recria) |
| `npm run db:reset` | Reinicia o banco |
| `npm run asaas:webhook` | Registra o webhook no Asaas |

## Autora

**Jessica Helena Araujo**, engenheira da computação, JA Developers · [GitHub](https://github.com/araujohjessica)
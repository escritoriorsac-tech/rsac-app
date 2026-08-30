# RSAC Practice Suite — app local

Sistema de gestão de clientes, casos, tarefas, agenda e financeiro do escritório RSAC.

## Pré-requisito

Instale o Node.js (versão 18 ou superior): https://nodejs.org (baixe a versão "LTS" e siga o instalador).

## Como rodar

1. Abra o Terminal (Mac/Linux) ou PowerShell (Windows) dentro desta pasta.
2. Instale as dependências (só precisa fazer uma vez):
   npm install
3. Inicie o app:
   npm run dev
4. Abra no navegador o endereço que aparecer no terminal (normalmente http://localhost:5173).

Os dados ficam salvos no navegador (localStorage) deste computador — se limpar os dados de navegação do navegador, o conteúdo cadastrado é perdido. Para uso profissional continuado, recomendo migrar depois para um banco de dados real.

## Fechar o app

Para parar, volte ao terminal e pressione Ctrl+C.

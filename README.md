# Extra Carta — Documento de Design

**Status:** conceito em desenvolvimento  
**Atualização:** 11/11/2026  
**Nome:** Extra Carta (provisório)

> Registro das decisões confirmadas, ideias em avaliação e pendências. Ainda não é um manual jogável.

## 1. Visão do jogo

Jogo de **extração** com incursões coletivas a uma masmorra. Os jogadores decidem quanto arriscar, quando sair e em quem confiar. Deve ser simples de aprender na hora, mas oferecer negociação, alianças, blefes, traições e aleatoriedade com decisões relevantes.

**Materiais previstos:** dois baralhos comuns (jogadores e masmorra), feijões (aposta, riqueza e resistência no mesmo recurso, sem pontos de vida separados) e, se necessário, dados. A vitória geral por acúmulo de feijões ainda terá uma meta a definir.

## 2. Regras e direções confirmadas

### 2.1 Incursão e masmorra
- Os jogadores entram **juntos**, mas podem extrair **individualmente**.
- A incursão possui um **número fixo de salas**, ainda indefinido, e um **prêmio ao final**.
- Continuar explorando deve aumentar os riscos e as recompensas.
- A exploração prevê **caminhos ocultos** representados por cartas viradas para baixo. Ainda não foi escolhido quem decide o caminho e como ele funciona.
- Incursões curtas são desejáveis para reduzir a espera de quem extrai antes.

### 2.2 Preparação e cartas dos jogadores
- Os jogadores recebem uma mão/conjunto inicial de cartas próprias, com distribuição ainda indefinida.
- Antes da incursão, cada jogador escolhe **quais e quantas cartas levar**.
- Cada carta levada exige **uma quantidade de feijões comprometidos**; cartas de valor maior custam mais. A tabela de custos está pendente.
- As cartas **numéricas** são usadas inicialmente para batalhas.
- Toda carta utilizada no ataque é **descartada e não pode ser usada novamente na mesma incursão**.
- Quem **extrai antecipadamente** conserva os feijões extraídos, mas **perde definitivamente as cartas utilizadas**.
- Quem **alcança o final da masmorra e extrai** recupera as cartas que utilizou.
- Destino das cartas não usadas e de cartas de jogadores que fracassam: pendente.

### 2.3 Combate
- Um segundo baralho fornece as cartas de monstros/masmorra. O número de uma carta de monstro representa inicialmente sua **força**.
- Há uma etapa de **negociação** entre os jogadores diante do encontro.
- As ações em discussão são **atacar, defender e fugir**.
- Para atacar, o jogador utiliza uma carta numérica própria, expondo os feijões a ela atrelados ao risco.
- **Os valores das cartas de ataque dos participantes são somados** e comparados à força do monstro. Exemplo: 5 + 6 = 11 vence monstro 9. A regra de empate ainda precisa ser especificada.
- **Todos os jogadores presentes participam de alguma forma e sofrem consequências** em caso de fracasso, inclusive quem não tem cartas.
- O resultado deve envolver estratégia e alguma imprevisibilidade, sem múltiplos testes demorados.
- **Defender ainda não possui mecânica aprovada.** A ideia de poder proteger a si ou um aliado é atraente, mas as soluções propostas até agora não satisfizeram o criador.
- O **cálculo do prejuízo da derrota** ainda está aberto; foi deliberadamente adiado para definir primeiro a arquitetura do combate.

### 2.4 Feijões, fracasso e saída
- **Feijões são um recurso único**: riqueza, aposta e resistência. Não existe barra de vida separada.
- Cartas preparadas exigem comprometer feijões, portanto cartas fortes carregam riscos maiores.
- O jogador **não morre**; ao ficar sem feijões na incursão, deve **sair da masmorra**.
- Os detalhes do vínculo entre carta, feijões comprometidos, saque e perdas não foram estabelecidos.

### 2.5 Fuga e extração
- A fuga permite tentar sair com o saque.
- **Se todos decidirem fugir, todos saem sem risco.**
- **Se alguém permanecer**, os fugitivos precisam realizar **um teste de dado**.
- Em caso de falha, a proposta original é que **metade dos feijões do fugitivo permaneça na incursão, com o jogador que não fugiu**.
- Não estão definidos arredondamento, destino quando vários permanecem, dificuldade do teste e distinção exata entre fuga no combate e extração entre salas.

### 2.6 Recompensas
- Monstros derrotados geram **feijões para quem participou do combate vitorioso**.
- A quantidade proposta de prêmio do monstro corresponde à quantidade de feijões necessária para ingressar com a carta correspondente; fórmula e partilha ainda pendentes.
- A última sala proporciona **recompensa final**.

## 3. Ideias promissoras, não aprovadas

### Liderança por eleição
Antes da incursão, pode haver **eleição de líder**, com negociação, subornos, alianças, disputa e resistência a determinados candidatos. O líder receberia vantagens durante a run. Poder de decisão e relação com escolha dos caminhos: indefinidos. A ideia foi posta em espera para priorizar exploração e combate.

### Traição, roubo e interferência
Os jogadores devem poder ajudar ou prejudicar uns aos outros. Roubo, sabotagem, blefes e traição são objetivos de experiência, não regras estabelecidas. Quem extrai cedo talvez receba alguma forma **limitada** de interferência para reduzir o tempo ocioso.

### Equipamentos
A preparação deve influenciar a força e os riscos. Um sistema separado de equipamentos ainda **não** foi aprovado. A escolha de cartas com custos em feijões já representa a preparação básica.

## 4. Problemas identificados

1. **Incentivo à omissão:** se um jogador só tem carta 8 contra monstro 10, e os demais não têm nada, por que gastá-la em benefício do grupo quando não basta para vencer?
2. **Ataque e defesa redundantes:** usar uma carta 4 para reduzir a força restante do monstro pode equivaler matematicamente a atacar com 4.
3. **Defesa com identidade própria:** proteger a si ou escolher um aliado sem criar exceções excessivas nem permitir defesa segura e gratuita em todas as salas.
4. **Sem cartas, sem escolhas?** Jogadores sem ataques ainda devem poder participar e ter decisões interessantes.
5. **Custo privado versus benefício coletivo:** atacar descarta carta própria, embora possa beneficiar todos.
6. **Efeito bola de neve:** quem tem mais feijões consegue financiar cartas melhores; quem perde tudo precisa ter possibilidade de recuperar-se.
7. **Escala cooperativa:** somar cartas de muitos jogadores pode trivializar monstros.
8. **Extração antecipada:** perder cartas gastas ao sair cedo precisa competir com o perigo de continuar para recuperá-las.
9. **Tempo e simplicidade:** resolução rápida, pouca contabilidade, evitar excessos de dados e subregras.

## 5. Próximas decisões

- Desenvolver uma mecânica de **defesa realmente distinta do ataque**, com possibilidade de proteger aliados, sem compromisso com as alternativas já rejeitadas.
- Definir **momento e sigilo das decisões** de atacar/defender/fugir e a maneira física de indicá-las.
- Resolver as **consequências de fracasso** e a distribuição individual de riscos sem vida separada.
- Definir **economia**: quantidade de cartas iniciais, custo em feijões por carta, saque, prêmio do monstro e distribuição entre vencedores.
- Precisar a **fuga**, inclusive teste de dado, a metade dos feijões e como repartir quando mais de um jogador permanece.
- Estabelecer número de salas, caminhos ocultos, figuras/ases, condição de vitória, duração-alvo e número de jogadores.
- Somente depois aprofundar a eleição de líder, privilégios, equipamentos, roubo e sabotagem.

## 6. Critérios de design

- A sensação desejada é **negociar, desconfiar, escolher entre atacar, defender e fugir, e decidir quando extrair**.
- O combate deve ser simples de executar, mas interessante de decidir.
- Testar novas hipóteses com **situações práticas vividas por um jogador**, antes de incorporá-las como regra.
- Em toda atualização, separar claramente **regra confirmada**, **hipótese** e **pendência**.

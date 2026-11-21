const crypto = require('node:crypto');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const revision = '70fff15a000904a3489dd49a4397d6fb67fb1db2';
const faces = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const ordinary = ['♣', '♦', '♥', '♠'].flatMap(suit => faces.map(face => face + suit));
const jokers = ['Coringa 1', 'Coringa 2'];
const names = ['Estrategista', 'Diplomata', 'Oportunista', 'Aventureiro'];
const defaults = {
  initial: 10, cardPledge: 1, monsterDice: 1, strongMonsterMinRank: 8, strongMonsterDice: 2,
  leaderDice: 1, revealBatchSize: 2, explorationPolicy: 'risco_saque_e_mandato',
  extraDiePrice: 1, maximumDice: 2, injury: 1, incursionLives: 2, defeatPenalty: 2,
  purchasedCards: false, cardPrice: 1,
  baseReward: 1, treasureExtra: 2, altarPenalty: 2, altarCost: 1,
  reelectionWindow: 'antes_da_eleicao_ordinaria',
  mutinyAllowedAfterReelection: true,
  diePurchase: 'preparacao_feijoes_protegidos_sem_devolucao',
  silenceExpires: 'fim_da_incursao',
  rewardFloor: 0, auctionTie: 'maior_d6',
  guardianBase: 40, guardianDice: 1,
  jokerPlacement: 'baralho_inteiro',
  auctionPayment: 'todos_pagantes_sem_reserva_obrigatoria',
  finalAdmission: 'todos_ainda_na_partida',
  finalWithoutNumeric: 'forca_da_carta_zero',
  finalArtifacts: 'inativos',
};

class RNG {
  constructor(seed) {
    this.seed = seed;
    this.counter = 0;
  }
  int(n) {
    const limit = 2 ** 32 - (2 ** 32 % n);
    let x;
    do {
      x = crypto.createHash('sha256').update(this.seed + ':' + this.counter++)
        .digest().readUInt32BE();
    } while (x >= limit);
    return x % n;
  }
  shuffle(items) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }
}

class NeedRuling extends Error {
  constructor(code, detail) {
    super(code);
    this.detail = detail;
  }
}

const strength = card => Number(card.slice(0, -1)) || 0;
const face = card => card.startsWith('Coringa') ? 'Coringa' : card.slice(0, -1);
const sum = values => values.reduce((a, b) => a + b, 0);
const money = p => p.safe + p.inside;
const byScore = (items, score) => items.map(item => ({item, score: score(item)}))
  .sort((a, b) => b.score - a.score).map(entry => entry.item);
const sharesForOthers = {
  Estrategista: 0.50, Diplomata: 0.8, Oportunista: 0.25, Aventureiro: 0.55,
};
const cardSpendingShares = {
  Estrategista: 0.35, Diplomata: 0.40, Oportunista: 0.45, Aventureiro: 0.60,
};

class Game {
  constructor(seed, rules) {
    this.seed = seed;
    this.r = rules;
    this.redRng = new RNG(seed + '/red');
    this.blackRng = new RNG(seed + '/black');
    this.diceRng = new RNG(seed + '/dice');
    this.extraMonsterDiceRng = new RNG(seed + '/dados-extras-monstros');
    this.botRng = new RNG(seed + '/decisions');
    this.red = this.redRng.shuffle([...ordinary]);
    this.black = this.blackRng.shuffle([...ordinary, ...jokers]);
    this.redSpent = [];
    this.redLost = [];
    this.blackSpent = [];
    this.queue = [];
    this.players = this.botRng.shuffle([...names]).map((name, id) => ({
      name, id, safe: rules.initial, inside: 0, pledge: 0, lives: 0, status: 'out',
      hand: [], vault: [], artifacts: [], jokers: [],
      trust: [0, 0, 0, 0], reputation: 0, leaderships: 0,
    }));
    this.keyHolder = null;
    this.silent = false;
    this.reelectionLastRound = false;
    this.revealedCount = 0;
    this.ledger = {out: 0, in: 0};
    this.round = 0;
    this.reward = 0;
    this.dice = 0;
    this.diceUsed = 0;
    this.dungeonPayments = 0;
    this.leader = null;
    this.previousLeader = null;
    this.winner = null;
    this.termination = null;
    this.events = [];
    this.metrics = {combats: 0, wins: 0, voluntary: 0, attackCards: 0,
      entries: 0, extracted: 0, eliminations: 0, escapes: 0, spentDice: 0,
      leaderChanges: 0, rewarded: 0, specials: {}, wealth: []};
    this.event('inicio', {players: this.players.map(p => p.name)});
  }
  event(type, detail = {}) {
    this.check();
    this.events.push({round: this.round, type, ...detail});
  }
  check() {
    const red = [...this.red, ...this.redSpent, ...this.redLost,
      ...this.players.flatMap(p => [...p.hand, ...p.vault])];
    const black = [...this.black, ...this.blackSpent, ...this.queue,
      ...this.players.flatMap(p => [...p.artifacts, ...p.jokers])];
    assert.deepEqual(red.sort(), [...ordinary].sort());
    assert.deepEqual(black.sort(), [...ordinary, ...jokers].sort());
    for (const p of this.players) {
      assert.ok([p.safe, p.inside, p.pledge].every(x => Number.isInteger(x) && x >= 0));
      assert.ok(Number.isInteger(p.lives) && p.lives >= 0 && p.lives <= this.r.incursionLives);
    }
    assert.ok(Number.isInteger(this.dungeonPayments) && this.dungeonPayments >= 0);
    assert.equal(sum(this.players.map(money)) + this.dungeonPayments,
      4 * this.r.initial + this.ledger.in - this.ledger.out);
    assert.ok(this.dice >= 0 && this.diceUsed >= 0 &&
      this.dice + this.diceUsed <= this.r.maximumDice);
  }
  need(rule, detail) {
    this.check();
    throw new NeedRuling(rule, detail);
  }
  d6() { return 1 + this.diceRng.int(6); }
  active() { return this.players.filter(p => p.status === 'inside'); }
  spend(p, where, amount) {
    assert.ok(p[where] >= amount);
    p[where] -= amount;
    this.ledger.out += amount;
  }
  special(card, detail) {
    const rank = face(card);
    this.metrics.specials[rank + '/' + detail.deck] =
      1 + (this.metrics.specials[rank + '/' + detail.deck] || 0);
    this.event('especial', {card, ...detail});
  }
  highestRoll(pool, reason) {
    while (pool.length > 1) {
      const rolls = pool.map(p => [p.id, this.d6()]);
      const high = Math.max(...rolls.map(([,value]) => value));
      this.event('desempate', {reason, rolls});
      pool = pool.filter(p => rolls.find(([id]) => id === p.id)[1] === high);
    }
    return pool[0];
  }
  election(voters, candidates, open) {
    if (!candidates.length) this.need('eleicao_sem_candidato', {open});
    const proposals = candidates.map(p => ({
      candidate: p.id,
      share: {Estrategista: 0.55, Diplomata: 0.8, Oportunista: 0.7, Aventureiro: 0.6}[p.name],
      exploration: p.name === 'Aventureiro' ? 'longa' : 'moderada',
    }));
    const counts = this.players.map(() => 0);
    const votes = voters.map(voter => {
      const target = byScore(candidates, candidate => {
        const offer = proposals.find(p => p.candidate === candidate.id);
        const credible = Math.min(1.2, Math.max(0.15, 0.65 + candidate.reputation * 0.14));
        const likesRisk = voter.name === 'Aventureiro' ? 0.8 : -0.4;
        const self = voter.name === 'Oportunista' ? 2.1 : 1.2;
        return (this.silent ? 0 : 2 * offer.share * credible) + 0.6 * voter.trust[candidate.id] +
          (!this.silent && offer.exploration === 'longa' ? likesRisk : 0) +
          (voter === candidate ? self : 0) + this.botRng.int(100) / 50;
      })[0];
      counts[target.id]++;
      return [voter.id, target.id];
    });
    if (!this.silent) this.event('negociacao_eleitoral', {open, proposals});
    const high = Math.max(...counts);
    this.event('apuracao', {open, counts, ...(open ? {votes} : {})});
    this.setLeader(this.highestRoll(candidates.filter(p => counts[p.id] === high), 'eleição'));
    this.promise = !this.silent && proposals.find(p => p.candidate === this.leader.id);
  }
  setLeader(p) {
    if (this.previousLeader !== null && this.previousLeader !== p.id) {
      this.metrics.leaderChanges++;
    }
    this.leader = p;
    this.previousLeader = p.id;
    p.leaderships++;
    this.event('lider', {player: p.id});
  }
  prepare() {
    const ready = this.players.filter(p => p.status !== 'eliminated');
    const reelected = !this.reelectionLastRound && this.reelect(ready);
    if (!reelected) this.election(ready, ready, false);
    this.reelectionLastRound = reelected;
    this.dice = this.r.leaderDice;
    this.diceUsed = 0;
    const plans = [];
    for (const p of ready) {
      const bounds = {
        Estrategista: [4, 6], Diplomata: [4, 5],
        Oportunista: [3, 5], Aventureiro: [6, 9],
      }[p.name];
      const plannedSize = bounds[0] + this.botRng.int(bounds[1] - bounds[0] + 1);
      const risk = this.r.purchasedCards ? plannedSize : Math.min(money(p), plannedSize);
      const room = this.r.cardPledge ? Math.floor(risk / this.r.cardPledge) : bounds[1];
      const count = Math.min(room, Math.max(1, risk - this.botRng.int(3)));
      plans.push({p, risk, count});
    }
    for (const {p, risk, count} of plans) {
      const transferred = this.r.purchasedCards ? 0 : risk;
      p.safe -= transferred;
      p.inside = transferred;
      p.lives = this.r.incursionLives;
      p.status = 'inside';
      const keep = byScore(p.vault, c => strength(c) || (face(c) === 'J' ? 8 : 6))
        .slice(0, count);
      p.vault = p.vault.filter(c => !keep.includes(c));
      p.hand = keep;
      const budget = this.r.purchasedCards ?
        Math.ceil(p.safe * cardSpendingShares[p.name]) : 0;
      let spent = 0;
      const price = this.r.purchasedCards ? this.r.cardPrice : 0;
      while (p.hand.length < count && spent + price <= budget) {
        const drawn = this.drawRed();
        if (!drawn) break;
        if (price) this.spend(p, 'safe', price);
        spent += price;
        p.hand.push(drawn);
        p.pledge = this.r.purchasedCards ? 0 : this.r.cardPledge * p.hand.length;
        this.event('compra_vermelha', {player: p.id, handSize: p.hand.length, cost: price});
      }
      p.pledge = this.r.purchasedCards ? 0 : this.r.cardPledge * p.hand.length;
      this.metrics.entries++;
      this.event('preparacao', {player: p.id, inside: transferred, protected: p.safe,
        lives: p.lives, cards: p.hand.length, pledge: p.pledge, spent});
    }
    this.buyExtras();
  }
  drawRed() {
    if (!this.red.length && this.redSpent.length) {
      this.red = this.redRng.shuffle(this.redSpent.splice(0));
      this.event('reembaralha_vermelho');
    }
    return this.red.pop();
  }
  buyExtras() {
    const p = this.leader;
    const tendency = {Estrategista: 25, Diplomata: 20, Oportunista: 10, Aventureiro: 62}[p.name];
    if (p.safe < this.r.extraDiePrice + 1 || this.dice >= this.r.maximumDice ||
        this.botRng.int(100) >= tendency) return;
    assert.equal(this.r.diePurchase, 'preparacao_feijoes_protegidos_sem_devolucao');
    p.safe -= this.r.extraDiePrice;
    this.dungeonPayments += this.r.extraDiePrice;
    this.dice++;
    this.event('compra_dado', {leader: p.id, cost: this.r.extraDiePrice,
      available: this.dice, dungeonPayments: this.dungeonPayments});
  }
  reelect(ready) {
    if (!this.leader || !ready.includes(this.leader)) {
      return false;
    }
    assert.equal(this.r.reelectionWindow, 'antes_da_eleicao_ordinaria');
    for (const p of ready) {
      const card = p.vault.find(c => face(c) === 'A');
      if (!card || (p !== this.leader && p.trust[this.leader.id] <= 1.1)) continue;
      p.vault.splice(p.vault.indexOf(card), 1);
      this.redSpent.push(card);
      this.special(card, {deck: 'vermelho', player: p.id, reelects: this.leader.id});
      this.setLeader(this.leader);
      return true;
    }
    return false;
  }
  playRed(p, card, detail) {
    p.hand.splice(p.hand.indexOf(card), 1);
    this.redSpent.push(card);
    this.special(card, {deck: 'vermelho', player: p.id, ...detail});
  }
  leadershipWindow() {
    if (this.mutinyUsed) return;
    const group = this.active();
    if (group.length < 2) return;
    const current = this.leader;
    for (const p of group) {
      const mutiny = p.hand.find(c => face(c) === 'K');
      if (p === current || !mutiny || p.trust[current.id] > -2) continue;
      this.mutinyUsed = true;
      this.playRed(p, mutiny, {deposed: current.id});
      this.election(group, group.filter(q => q !== current), true);
      return;
    }
  }
  escapeWindow() {
    if (!this.queue.some(strength)) return;
    for (const p of this.active()) {
      const card = p.hand.find(c => face(c) === 'J');
      if (!card || this.queue.length < 2 || p.lives !== 1) continue;
      if (this.queue.some(c => jokers.includes(c)) && p.name === 'Aventureiro') continue;
      this.playRed(p, card, {});
      p.vault.push(...p.hand.splice(0));
      p.safe += p.inside;
      p.inside = 0;
      p.pledge = 0;
      p.status = 'escaped';
      this.metrics.escapes++;
      this.event('fuga', {player: p.id, lives: p.lives});
      if (p === this.leader && this.active().length) {
        this.election(this.active(), this.active(), true);
      }
    }
  }
  explore() {
    while (this.black.length && this.active().length) {
      const batchCount = Math.min(this.black.length, this.r.revealBatchSize);
      for (let i = 0; i < batchCount; i++) {
        const card = this.black.shift();
        this.revealedCount++;
        this.roundCards.push(card);
        this.queue.push(card);
        this.reward += this.r.baseReward;
        this.event('revela', {card, leader: this.leader.id, reward: this.reward});
      }
      this.leadershipWindow();
      this.escapeWindow();
      if (!this.shouldExploreFurther()) break;
    }
    this.event('encerra_revelacao', {remaining: this.black.length, challenges: this.queue.length});
  }
  shouldExploreFurther() {
    const leader = this.leader;
    const group = this.active();
    const hasKey = this.queue.some(c => jokers.includes(c));
    const remaining = this.black.length;
    const reason = !group.length ? 'grupo_fora' : !remaining ? 'baralho_esgotado' :
      hasKey ? 'coringa_encontrado' : null;
    if (reason) {
      this.event('decisao_exploracao', {leader: leader.id, revealed: this.queue.length,
        continues: false, reason});
      return false;
    }

    const averageForce = rank => rank + 3.5 * (rank >= this.r.strongMonsterMinRank ?
      this.r.strongMonsterDice : this.r.monsterDice);
    const monsters = this.queue.map(strength).filter(Boolean);
    const knownThreat = sum(monsters.map(averageForce)) +
      2 * this.queue.filter(card => face(card) === 'Q').length;

    // The leader sees their own cards and only the size of other players' hands.
    const ownResources = 0.78 * sum(leader.hand.map(strength));
    const expectedAllyResources = sum(group.filter(player => player !== leader).map(player => {
      const expectedCooperation = Math.min(0.70, Math.max(0.25, 0.48 + 0.055 * leader.trust[player.id]));
      return player.hand.length * (9 / 13) * 6 * expectedCooperation;
    }));
    const resources = ownResources + expectedAllyResources + 3.5 * this.dice;
    const nextCards = Math.min(remaining, this.r.revealBatchSize);
    const unknownThreat = nextCards *
      4 * sum(faces.map(Number).filter(Boolean).map(averageForce)) / (ordinary.length + jokers.length);
    const appetite = {Estrategista: 0.78, Diplomata: 0.85, Oportunista: 0.70, Aventureiro: 1.02};
    const riskTolerance = resources * appetite[leader.name] * (0.9 + this.botRng.int(21) / 100);

    // Compare the value of one more pair against the risk to the loot already revealed.
    const risk = threat => Math.min(0.9, Math.max(0, (threat / Math.max(1, resources) - 0.85) * 0.70));
    const riskNow = risk(knownThreat);
    const riskAfter = risk(knownThreat + unknownThreat);
    const atStake = this.reward + this.r.treasureExtra * this.queue.filter(card => face(card) === 'A').length;
    const expectedGain = nextCards * (this.r.baseReward + 4 * this.r.treasureExtra / (ordinary.length + jokers.length));
    const expectedExtraPenalty = (this.r.defeatPenalty - 1) * nextCards *
      (36 / (ordinary.length + jokers.length)) * riskAfter;
    const expectedLootChange = (expectedGain - expectedExtraPenalty) * (1 - riskAfter) -
      atStake * (riskAfter - riskNow);
    const lastVote = this.events.findLast(event => event.type === 'apuracao' && !event.open);
    const lastSupport = lastVote ? lastVote.counts[leader.id] / sum(lastVote.counts) : 0.25;
    const ownReelection = !this.reelectionLastRound &&
      [...leader.hand, ...leader.vault].some(card => face(card) === 'A');
    const renewalChance = ownReelection ? 0.9 : Math.min(0.9, 0.25 + 0.65 * lastSupport);
    const ownShare = group.length > 1 ? 1 - sharesForOthers[leader.name] : 1;
    const lootValue = 5 * ownShare * expectedLootChange;
    const mandateValue = 5 * (1 - renewalChance) * expectedLootChange;
    const tolerance = riskTolerance + lootValue + mandateValue;
    const continues = knownThreat + unknownThreat <= tolerance;
    this.event('decisao_exploracao', {leader: leader.id, revealed: this.queue.length,
      monsters, knownThreat, unknownThreat, resources, riskTolerance, tolerance, continues,
      expectedLootChange, lootValue, mandateValue, renewalChance,
      reason: continues ? 'risco_aceitavel' : 'risco_acima_da_tolerancia'});
    return continues;
  }
  alterReward(delta) {
    this.reward = Math.max(0, this.reward + delta);
  }
  chooseCards(p, target, expectedHelp) {
    const numeric = p.hand.filter(c => strength(c));
    const margin = {Estrategista: 3, Diplomata: 4, Oportunista: 2, Aventureiro: 5}[p.name];
    const aim = Math.max(3, target + margin - expectedHelp);
    const reserve = this.revealedCount >= 26 || this.queue.some(c => jokers.includes(c));
    const top = reserve ? Math.max(0, ...p.vault.map(strength)) : 0;
    const combinations = [[]];
    for (const card of numeric) {
      combinations.push(...combinations.map(cards => [...cards, card]));
    }
    const cost = cards => {
      const power = sum(cards.map(strength));
      const saved = reserve ?
        Math.max(top, ...numeric.filter(c => !cards.includes(c)).map(strength)) : 0;
      const reserveCost = reserve && p.lives > this.r.injury ? Math.max(0, 8 - saved) : 0;
      return Math.max(0, aim - power) * 2.2 + 2.9 * cards.length + 0.18 * power
        + reserveCost + (p.name === 'Oportunista' && cards.length ? 0.6 : 0);
    };
    return byScore(combinations, cards => -cost(cards))[0];
  }
  artifactWindow(kind, rolls, deficit, participants) {
    const index = kind === 'monstro' ? rolls.indexOf(Math.max(...rolls)) :
      rolls.indexOf(Math.min(...rolls));
    if (index < 0 || deficit <= 0) return;
    const old = rolls[index];
    const possiblyEnough = kind === 'monstro' ? old >= 5 : old <= 2 && deficit <= 6 - old;
    if (!possiblyEnough) return;
    const user = this.active().find(p => p.artifacts.length &&
      (participants.includes(p) || p.name === 'Diplomata' ||
        participants.some(q => p.trust[q.id] > 1)));
    if (!user) return;
    const artifact = user.artifacts.shift();
    this.blackSpent.push(artifact);
    rolls[index] = this.d6();
    this.event('usa_artefato', {player: user.id, artifact, kind, original: old, newValue: rolls[index]});
  }
  fight(card, silences) {
    const group = this.active();
    const leader = this.leader;
    let eligible = group.filter(p => p !== this.lastDesignated);
    if (this.lastDesignated && group.includes(this.lastDesignated)) {
      const previous = this.lastDesignated;
      const volunteers = previous.hand.some(strength) && previous.lives > 1 && this.botRng.int(100) < 35;
      if (volunteers) eligible.push(previous);
    }
    if (!eligible.length) this.need('designacao_sem_voluntario_unico', {monster: card});
    const required = byScore(eligible, p => {
      const count = p.hand.length * 0.72;
      const trust = leader.trust[p.id];
      const willingness = p === leader ? 0.5 : p.reputation * 0.16;
      const expendable = leader.name === 'Oportunista' && p !== leader ? -trust * 2.2 : trust * 0.28;
      return count + willingness + expendable + this.botRng.int(100) / 34;
    })[0];
    this.lastDesignated = required;
    this.event('designacao', {monster: card, leader: leader.id, required: required.id, silence: !!silences});
    const mandatory = [required];
    const authorities = group.flatMap(p => {
      const order = p.hand.find(c => face(c) === 'Q');
      const target = byScore(group.filter(q => q !== p && q !== required),
        q => 0.7 * q.hand.length - p.trust[q.id])[0];
      const willingness = p === required || p.name === 'Oportunista' ||
        (p.name === 'Diplomata' && strength(card) >= 8);
      return order && target && willingness && strength(card) >= 6 && this.botRng.int(100) < 33 ?
        [{p, order, target}] : [];
    });
    for (const {p, order, target} of authorities) {
      if (mandatory.includes(target)) continue;
      this.playRed(p, order, {target: target.id});
      mandatory.push(target);
    }
    const willingness = {Estrategista: 43, Diplomata: 66, Oportunista: 24, Aventureiro: 62};
    const volunteers = group.filter(p => !mandatory.includes(p) && p.hand.some(c => strength(c)) &&
      this.botRng.int(100) < willingness[p.name] + 8 * p.trust[required.id] +
      (p.lives <= 1 ? -30 : 0) + (this.queue.some(c => jokers.includes(c)) ? 12 : 0));
    const participants = [...mandatory, ...volunteers];
    const claims = silences ? [] : participants.map(p => {
      const high = Math.max(0, ...p.hand.map(strength));
      const appearance = p.name === 'Oportunista' && this.botRng.int(100) < 40 ? high + 3 : high;
      return {player: p.id, promised: Math.min(12, Math.round(appearance * 0.8))};
    });
    if (claims.length) this.event('negociacao_combate', {monster: card, claims});
    const commitments = participants.map(p => {
      const expectedHelp = silences ? 0 : Math.min(8, 0.65 * sum(claims
        .filter(c => c.player !== p.id)
        .map(c => c.promised * Math.min(1, Math.max(0.3, 0.75 + 0.09 * p.trust[c.player])))));
      return {p, cards: this.chooseCards(p, strength(card), expectedHelp)};
    });
    for (const {p, cards} of commitments) {
      p.hand = p.hand.filter(c => !cards.includes(c));
      this.redSpent.push(...cards);
    }
    const raw = sum(commitments.flatMap(c => c.cards.map(strength)));
    this.event('compromisso_simultaneo', {monster: card,
      commitments: commitments.map(c => ({player: c.p.id, cards: c.cards}))});
    const monsterValue = strength(card);
    const rolls = Array.from({length: this.r.monsterDice}, () => this.d6());
    if (monsterValue >= this.r.strongMonsterMinRank) {
      while (rolls.length < this.r.strongMonsterDice) {
        rolls.push(1 + this.extraMonsterDiceRng.int(6));
      }
    }
    this.event('dado_monstro', {monster: card, rolls: [...rolls], enemy: strength(card) + sum(rolls)});
    this.artifactWindow('monstro', rolls, strength(card) + sum(rolls) - raw, participants);
    const enemy = strength(card) + sum(rolls);
    let reinforcement = 0;
    const deficit = enemy - raw;
    if (deficit > 0 && deficit <= 6 * this.dice) {
      const willing = leader.name !== 'Oportunista' || participants.includes(leader) ||
        leader.trust[required.id] > -1 || this.queue.some(c => jokers.includes(c));
      if (willing) reinforcement = Math.min(this.dice, Math.max(1, Math.ceil(deficit / 3.5)));
    }
    const recipient = participants.includes(leader) ? leader : required;
    this.dice -= reinforcement;
    this.diceUsed += reinforcement;
    this.metrics.spentDice += reinforcement;
    this.event('concessao_reforco', {quantity: reinforcement, player: recipient.id});
    const supports = Array.from({length: reinforcement}, () => this.d6());
    this.event('dados_reforco', {rolls: [...supports]});
    this.artifactWindow('reforço', supports, enemy - raw - sum(supports), participants);
    const win = raw + sum(supports) >= enemy;
    this.metrics.combats++;
    this.metrics.wins += Number(win);
    this.metrics.voluntary += Number(volunteers.length > 0);
    this.metrics.attackCards += sum(commitments.map(c => c.cards.length));
    for (const c of commitments) {
      const claim = claims.find(b => b.player === c.p.id);
      const power = sum(c.cards.map(strength));
      for (const other of group.filter(p => p !== c.p)) {
        if (volunteers.includes(c.p) && power > 0) other.trust[c.p.id] += 0.45;
        if (claim && power + 2 < claim.promised) other.trust[c.p.id] -= 0.4;
      }
    }
    if (win) {
      this.event('resultado_combate', {win, monster: card, strength: enemy, attack: raw + sum(supports)});
      return;
    }
    this.alterReward(-this.r.defeatPenalty);
    for (const p of participants) p.lives = Math.max(0, p.lives - this.r.injury);
    this.event('resultado_combate', {win, monster: card, strength: enemy,
      attack: raw + sum(supports), reward: this.reward, hurt: participants.map(p => p.id),
      remainingLives: participants.map(p => [p.id, p.lives])});
    this.eliminations();
  }
  eliminations() {
    const falling = this.active().filter(p => p.lives === 0);
    for (const p of falling) {
      if (p.inside) this.spend(p, 'inside', p.inside);
      const canReturn = true;
      if (!canReturn) this.blackSpent.push(...p.artifacts.splice(0));
      const lostCards = p.hand.length;
      this.redSpent.push(...p.hand.splice(0));
      p.pledge = 0;
      p.status = canReturn ? 'out' : 'eliminated';
      this.metrics.eliminations++;
      this.event('eliminacao', {player: p.id, lostCards, permanent: p.status === 'eliminated'});
    }
    if (falling.includes(this.leader) && this.active().length) this.election(this.active(), this.active(), true);
  }
  resolve() {
    let silences = 0;
    for (const card of [...this.queue]) {
      if (!this.active().length) break;
      if (!this.queue.includes(card)) continue;
      if (strength(card)) {
        this.fight(card, silences);
      } else if (face(card) === 'A') {
        this.alterReward(this.r.treasureExtra);
        this.special(card, {deck: 'preto', reward: this.reward});
      } else if (face(card) === 'J') {
        const funds = this.r.purchasedCards ? 'safe' : 'inside';
        const payer = this.active().find(p => p[funds] > this.r.altarCost &&
          this.botRng.int(100) < (p.name === 'Diplomata' ? 65 : p === this.leader ? 57 : 13));
        if (payer) {
          this.spend(payer, funds, this.r.altarCost);
          for (const p of this.active().filter(q => q !== payer)) p.trust[payer.id] += 0.4;
        } else this.alterReward(-this.r.altarPenalty);
        this.special(card, {deck: 'preto', payer: payer?.id ?? null, reward: this.reward});
      } else if (face(card) === 'Q') {
        silences = 1;
        this.silent = true;
        this.special(card, {deck: 'preto'});
      }
      if (strength(card) || ['A', 'J', 'Q'].includes(face(card))) this.moveQueue(card, this.blackSpent);
      this.event('desafio_resolvido', {card});
      this.leadershipWindow();
      this.escapeWindow();
    }
    if (silences && !this.queue.some(c => strength(c))) {
      assert.equal(this.r.silenceExpires, 'fim_da_incursao');
      this.event('silencio_expira', {silences});
    }
  }
  moveQueue(card, dest) {
    this.queue.splice(this.queue.indexOf(card), 1);
    dest.push(card);
  }
  distribute(group) {
    this.reward = Math.max(this.r.rewardFloor, this.reward);
    const leader = this.leader;
    const planned = this.promise?.share ?? 0.5;
    const share = sharesForOthers[leader.name];
    const others = byScore(group.filter(p => p !== leader), p =>
      leader.trust[p.id] + (p.jokers.length ? -0.65 : 0) + this.botRng.int(10) / 10);
    const allocation = group.map(p => [p.id, 0]);
    let othersPool = others.length ? Math.round(this.reward * share) : 0;
    const otherTotal = othersPool;
    for (const [index, p] of others.entries()) {
      const amount = leader.name === 'Oportunista' ? othersPool :
        Math.ceil(othersPool / (others.length - index));
      allocation.find(([id]) => id === p.id)[1] = amount;
      othersPool -= amount;
    }
    allocation.find(([id]) => id === leader.id)[1] = this.reward - otherTotal;
    for (const [id, amount] of allocation) {
      const p = this.players[id];
      p.safe += amount;
      if (p !== leader && this.reward > 0) {
        p.trust[leader.id] += amount > 0 ? 0.75 : -0.9;
      }
    }
    if (others.length && this.reward >= 2) {
      leader.reputation += otherTotal + 0.5 >= this.reward * planned ? 0.7 : -0.9;
    }
    this.ledger.in += this.reward;
    this.metrics.rewarded += this.reward;
    this.event('distribuicao', {leader: leader.id, allocation, promisedShare: planned});
  }
  auction(card, group) {
    const donations = [];
    if (group.length > 1) {
      for (const donor of group) {
        const candidate = byScore(group.filter(p => p !== donor && donor.trust[p.id] > 1 &&
          !p.jokers.length && !donor.jokers.length), p => donor.trust[p.id])[0];
        if (candidate && donor.name === 'Diplomata' && donor.safe > 5 &&
            this.botRng.int(4) === 0) {
          donor.safe--;
          candidate.safe++;
          donations.push([donor.id, candidate.id, 1]);
          candidate.trust[donor.id] += 0.5;
        }
      }
      this.event('negociacao_leilao', {card, donations});
    }
    const options = group.map(p => {
      const fraction = {Estrategista: 0.52, Diplomata: 0.44, Oportunista: 0.79, Aventureiro: 0.85}[p.name];
      const push = fraction + (this.botRng.int(21) - 10) / 100;
      return {p, bid: Math.min(p.safe, Math.floor(p.safe * push))};
    });
    if (group.length > 1) {
      this.event('lances_revelados', {card, bids: options.map(a => [a.p.id, a.bid])});
    }
    const high = Math.max(...options.map(a => a.bid));
    const tied = options.filter(a => a.bid === high).map(a => a.p);
    if (group.length > 1 && tied.length > 1 && this.r.auctionTie === null) {
      this.need('empate_leilao', {card, bid: high, players: tied.map(p => p.name)});
    }
    if (tied.length > 1) assert.equal(this.r.auctionTie, 'maior_d6');
    const winner = group.length === 1 ? group[0] : this.highestRoll(tied, 'leilão');
    if (group.length > 1) {
      for (const {p, bid} of options) this.spend(p, 'safe', bid);
      this.event('pagamentos_leilao', {card, payments: options.map(a => [a.p.id, a.bid])});
    }
    this.moveQueue(card, winner.jokers);
    this.newHolder = winner;
    this.special(card, {deck: 'preto', winner: winner.id});
    this.event('coringa', {player: winner.id, card, paid: group.length === 1 ? 0 : high});
  }
  extract() {
    const group = this.active();
    if (!group.length) {
      const returned = new Set(this.roundCards);
      this.blackSpent = this.blackSpent.filter(c => !returned.has(c));
      this.queue.length = 0;
      this.black.push(...returned);
      this.blackRng.shuffle(this.black);
      this.event('reembaralha_incursao_fracassada', {cards: [...returned]});
      return;
    }
    for (const p of group) {
      p.safe += p.inside;
      p.inside = 0;
      p.vault.push(...p.hand.splice(0));
      p.pledge = 0;
      p.status = 'extracted';
    }
    this.silent = false;
    this.metrics.extracted += group.length;
    this.event('extracao', {players: group.map(p => p.id)});
    this.distribute(group);
    for (const card of this.queue.filter(c => face(c) === 'K')) {
      const recipient = this.leader.name === 'Diplomata' ?
        byScore(group, p => this.leader.trust[p.id] + (p === this.leader ? 0.5 : 0))[0] :
        this.leader;
      this.moveQueue(card, recipient.artifacts);
      this.special(card, {deck: 'preto', recipient: recipient.id});
    }
    const revealedJokers = this.queue.filter(c => jokers.includes(c));
    if (revealedJokers.length) {
      const eligible = group.filter(p => !p.jokers.length);
      if (!eligible.length) this.need('segundo_coringa_sem_elegivel', {});
      this.auction(revealedJokers[0], eligible);
      if (revealedJokers.length === 2) {
        this.keyHolder = eligible.find(p => p.jokers.includes(revealedJokers[0]));
        this.moveQueue(revealedJokers[1], this.blackSpent);
      }
    }
  }
  clockwise() {
    const start = this.leader.id;
    return this.players.slice(start).concat(this.players.slice(0, start));
  }
  selectKey() {
    const holders = this.clockwise().filter(p => p.jokers.length);
    if (!holders.length) return;
    const wantsToOpen = p => {
      const threshold = {Estrategista: 8, Diplomata: 8, Oportunista: 9, Aventureiro: 7}[p.name];
      return p.safe > 0 && p.vault.some(card => strength(card) >= threshold);
    };
    const willing = holders.filter(p => wantsToOpen(p));
    this.event('abertura_porta', {newHolder: this.newHolder?.id, willing: willing.map(p => p.id)});
    const pool = willing.length ? willing : this.black.length ? [] : holders;
    if (pool.length) this.keyHolder = this.highestRoll(pool, 'porta');
  }
  guardian() {
    this.round++;
    const group = this.clockwise().filter(p => p.status !== 'eliminated');
    this.event('abre_final', {leader: null, keyHolder: this.keyHolder.id,
      finalists: group.map(p => p.id), base: this.r.guardianBase});
    const chosen = group.map(p => {
      const canPledge = p.safe >= this.r.cardPledge;
      const drawn = canPledge ? this.drawRed() : undefined;
      if (drawn) p.vault.push(drawn);
      const card = canPledge ? byScore(p.vault.filter(strength), strength)[0] : undefined;
      this.event('preparacao_final', {player: p.id, drew: Boolean(drawn),
        selectedSource: !card ? 'nenhuma' : card === drawn ? 'sorteio' : 'reserva',
        protected: p.safe});
      return {p, card};
    });
    for (const {p, card} of chosen) {
      if (!card) continue;
      p.safe -= this.r.cardPledge;
      p.inside += this.r.cardPledge;
      p.pledge = this.r.cardPledge;
      p.vault.splice(p.vault.indexOf(card), 1);
      this.redSpent.push(card);
    }
    this.event('compromisso_final', {cards: chosen.map(({p, card}) => [p.id, card ?? null])});
    const targetDice = Array.from({length: this.r.guardianDice}, () => this.d6());
    const target = this.r.guardianBase + sum(targetDice);
    this.event('dado_guardiao', {rolls: targetDice, target});
    const results = chosen.map(({p, card}) => {
      const rolls = Array.from({length: p === this.keyHolder ? 2 : 1}, () => this.d6());
      return {player: p.id, rolls, score: (card ? strength(card) : 0) + Math.max(...rolls)};
    });
    const total = sum(results.map(r => r.score));
    this.event('resultado_guardiao', {target, total, results});
    if (total < target) {
      this.collectiveDefeat('guardiao');
      return;
    }
    const high = Math.max(...results.map(r => r.score));
    const tied = results.filter(r => r.score === high).map(r => this.players[r.player]);
    this.winner = this.highestRoll(tied, 'final');
    this.termination = 'vitoria_individual';
    this.event('vitoria', {player: this.winner.id, keyHolder: this.keyHolder.id});
  }
  collectiveDefeat(reason) {
    this.termination = 'derrota_coletiva';
    this.event('derrota_coletiva', {reason});
  }
  run() {
    try {
      while (!this.termination && !this.keyHolder && this.black.length &&
          this.players.some(p => p.status !== 'eliminated')) {
        this.round++;
        this.reward = 0;
        this.mutinyUsed = false;
        this.silent = false;
        this.lastDesignated = null;
        this.roundCards = [];
        this.newHolder = null;
        this.prepare();
        this.explore();
        this.resolve();
        this.extract();
        this.metrics.wealth.push(this.players.map(money));
        this.event('incursao_encerrada', {wealth: this.players.map(money),
          diceUnused: this.dice, dungeonPayments: this.dungeonPayments});
        if (!this.keyHolder) this.selectKey();
        this.ledger.out += this.dungeonPayments;
        this.dungeonPayments = 0;
        this.dice = 0;
        this.diceUsed = 0;
      }
      if (!this.termination) {
        if (this.keyHolder) this.guardian();
        else this.collectiveDefeat(this.black.length ? 'todos_eliminados' : 'masmorra_esgotada');
      }
    } catch (error) {
      if (!(error instanceof NeedRuling)) throw error;
      this.termination = 'pausa';
      this.blocked = {rule: error.message, ...error.detail};
    }
    this.check();
    return {
      seed: this.seed, roundsStarted: this.round, roundsCompleted: this.metrics.wealth.length,
      termination: this.termination, winner: this.winner?.name ?? null, blocked: this.blocked,
      players: this.players.map(p => ({id: p.id, name: p.name, protected: p.safe,
        inside: p.inside, lives: p.lives, initialPledge: p.pledge, hand: p.hand, vault: p.vault,
        reputation: p.reputation, trust: p.trust, leaderships: p.leaderships,
        artifacts: p.artifacts, jokers: p.jokers, status: p.status})),
      metrics: this.metrics, remaining: {red: this.red.length, black: this.black.length,
        redSpent: this.redSpent.length, redLost: this.redLost.length, blackSpent: this.blackSpent.length,
        queue: this.queue, reward: this.reward, dice: this.dice, diceUsed: this.diceUsed,
        dungeonPayments: this.dungeonPayments},
      events: this.events,
    };
  }
}

module.exports = {Game, defaults};

if (require.main === module) {
  const [batchSeed, countText = '10', file = 'resultados.json'] = process.argv.slice(2);
  assert.ok(batchSeed, 'Informe a semente');
  const count = Number(countText);
  assert.ok(Number.isSafeInteger(count) && count > 0);
  const games = Array.from({length: count}, (_, i) => new Game(batchSeed + '/' + (i + 1), defaults).run());
  fs.writeFileSync(file, JSON.stringify({revision, batchSeed, rules: defaults, games}, null, 2));
  for (const game of games) console.log(game.seed, game.termination, game.blocked?.rule || game.winner || '');
}

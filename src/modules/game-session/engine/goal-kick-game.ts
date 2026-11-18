import {
  KEEPER,
  PHYSICS,
  makeDefenders,
  resolveShot,
  trajectory,
} from './goal-kick-physics';
import type { Curve, Defender, Outcome, Point } from './goal-kick-physics';

export class GoalKickError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export interface GoalKickPlayer {
  playerId: string;
  playerName: string;
  avatarId: number;
  connected: boolean;
}
export interface AttemptBoard {
  attemptId: string;
  readyAt: number;
  ballStart: Point;
  defenders: Defender[];
  keeper: Point & { displayName: string; participantId?: string };
}
export interface ShotResult {
  shotId: string;
  attemptId: string;
  commandId: string;
  outcome: Outcome;
  resolvedAt: number;
  contactU: number;
  contactPoint: Point;
  pointsAwarded: number;
  totalGoals: number;
  totalScore: number;
}
interface Shot {
  shotId: string;
  attemptId: string;
  commandId: string;
  aimX: number;
  curve: number;
  path: Curve;
  shotStartedAt: number;
  flightMs: number;
  plan: ReturnType<typeof resolveShot>;
  resolvedAt: number;
  resolved: boolean;
}
interface PlayerState {
  player: GoalKickPlayer;
  revision: number;
  status: 'READY' | 'FLIGHT' | 'RESULT';
  board: AttemptBoard;
  shot?: Shot;
  lastResult?: ShotResult;
  goals: number;
  cache: Map<string, { signature: string; shot: Shot }>;
  recent: number[];
}
export interface GoalKickChanges {
  results: { playerId: string; result: ShotResult }[];
  ready: string[];
  ended: boolean;
}

/** Pure authoritative activity. No timers/network/DB; all logical time is injected. */
export class GoalKickGame {
  readonly startedAt: number;
  readonly endsAt: number;
  phase: 'PLAYING' | 'FINISHED' | 'CANCELLED' = 'PLAYING';
  scoreboardVersion = 1;
  readonly players = new Map<string, PlayerState>();
  constructor(
    readonly gameId: string,
    readonly startCommandId: string,
    roster: GoalKickPlayer[],
    private readonly ids: () => string,
    private readonly clock: () => number = Date.now,
    private readonly rng: () => number = Math.random,
  ) {
    this.startedAt = clock();
    this.endsAt = this.startedAt + PHYSICS.durationMs;
    for (const player of roster)
      this.players.set(player.playerId, {
        player: { ...player },
        revision: 1,
        status: 'READY',
        board: {} as AttemptBoard,
        goals: 0,
        cache: new Map(),
        recent: [],
      });
    for (const state of this.players.values())
      state.board = this.newBoard(state, this.startedAt);
  }
  private newBoard(state: PlayerState, readyAt: number): AttemptBoard {
    const others = [...this.players.values()].filter(
      (s) => s.player.playerId !== state.player.playerId,
    );
    const online = others.filter((s) => s.player.connected);
    let choices = online.length ? online : others;
    if (choices.length > 1)
      choices = choices.filter(
        (s) => s.player.playerId !== state.board?.keeper?.participantId,
      );
    const keeper = choices[Math.floor(this.rng() * choices.length)]?.player;
    return {
      attemptId: this.ids(),
      readyAt,
      ballStart: { x: 500, y: 620 },
      defenders: makeDefenders(this.rng, state.board?.defenders),
      keeper: {
        ...KEEPER,
        displayName: keeper
          ? keeper.playerName + (keeper.connected ? '' : ' (desconectado)')
          : 'Portero de práctica',
        ...(keeper && { participantId: keeper.playerId }),
      },
    };
  }
  shoot(
    userId: string,
    attemptId: string,
    commandId: string,
    aimX: number,
    curve: number,
  ) {
    const state = this.players.get(userId);
    if (!state)
      throw new GoalKickError(
        'FORBIDDEN',
        'Solo jugadores inscritos pueden tirar',
      );
    if (
      ![aimX, curve].every(Number.isFinite) ||
      aimX < 200 ||
      aimX > 800 ||
      Math.abs(curve) > 260
    )
      throw new GoalKickError(
        'INVALID_COMMAND',
        'Dirección o curva fuera de rango',
      );
    const signature = JSON.stringify([attemptId, aimX, curve]);
    const old = state.cache.get(commandId);
    if (old) {
      if (old.signature !== signature)
        throw new GoalKickError(
          'COMMAND_CONFLICT',
          'El comando ya tiene otros parámetros',
        );
      return this.publicShot(old.shot);
    }
    const now = this.clock();
    if (this.phase !== 'PLAYING' || now >= this.endsAt)
      throw new GoalKickError('GAME_ENDED', 'El tiempo del minijuego terminó');
    if (
      state.status !== 'READY' ||
      state.board.attemptId !== attemptId ||
      now < state.board.readyAt
    )
      throw new GoalKickError(
        'ATTEMPT_NOT_READY',
        'Espera al siguiente intento',
      );
    state.recent = state.recent.filter((t) => t > now - 1000);
    if (state.recent.length >= 5 || state.cache.size >= 128)
      throw new GoalKickError('RATE_LIMITED', 'Demasiados tiros');
    state.recent.push(now);
    aimX = Math.round(aimX * 100) / 100;
    curve = Math.round(curve * 100) / 100;
    const path = trajectory(aimX, curve),
      plan = resolveShot(path, state.board.defenders);
    const shot: Shot = {
      shotId: this.ids(),
      attemptId,
      commandId,
      aimX,
      curve,
      path,
      shotStartedAt: now,
      flightMs: PHYSICS.flightMs,
      plan,
      resolvedAt: now + plan.contactU * PHYSICS.flightMs,
      resolved: false,
    };
    state.shot = shot;
    state.status = 'FLIGHT';
    state.revision++;
    state.cache.set(commandId, { signature, shot });
    return this.publicShot(shot);
  }
  advance(now = this.clock()): GoalKickChanges {
    const changes: GoalKickChanges = { results: [], ready: [], ended: false };
    if (this.phase !== 'PLAYING') return changes;
    // Settle all valid pre-deadline impacts even when the event loop/deadline callback is late.
    const pending = [...this.players.entries()]
      .filter(([, s]) => s.shot && !s.shot.resolved)
      .sort((a, b) => a[1].shot!.resolvedAt - b[1].shot!.resolvedAt);
    for (const [playerId, state] of pending) {
      const shot = state.shot!;
      const timeout = shot.resolvedAt >= this.endsAt;
      const due = timeout ? this.endsAt : shot.resolvedAt;
      if (now < due) continue;
      const outcome: Outcome = timeout ? 'TIMEOUT' : shot.plan.outcome;
      if (outcome === 'GOAL') {
        state.goals++;
        this.scoreboardVersion++;
      }
      shot.resolved = true;
      state.status = 'RESULT';
      state.revision++;
      state.lastResult = {
        shotId: shot.shotId,
        attemptId: shot.attemptId,
        commandId: shot.commandId,
        outcome,
        resolvedAt: due,
        contactU: timeout
          ? Math.max(0, (this.endsAt - shot.shotStartedAt) / shot.flightMs)
          : shot.plan.contactU,
        contactPoint: timeout
          ? bezierAt(
              shot.path,
              (this.endsAt - shot.shotStartedAt) / shot.flightMs,
            )
          : shot.plan.contactPoint,
        pointsAwarded: outcome === 'GOAL' ? 10 : 0,
        totalGoals: state.goals,
        totalScore: state.goals * 10,
      };
      changes.results.push({ playerId, result: state.lastResult });
    }
    if (now >= this.endsAt) {
      this.phase = 'FINISHED';
      this.scoreboardVersion++;
      changes.ended = true;
      return changes;
    }
    for (const [playerId, state] of this.players) {
      if (
        state.status === 'RESULT' &&
        state.lastResult &&
        now >= state.lastResult.resolvedAt + PHYSICS.pauseMs
      ) {
        state.board = this.newBoard(
          state,
          state.lastResult.resolvedAt + PHYSICS.pauseMs,
        );
        state.status = 'READY';
        state.shot = undefined;
        state.revision++;
        changes.ready.push(playerId);
      }
    }
    return changes;
  }
  cancel() {
    if (this.phase === 'PLAYING') {
      this.phase = 'CANCELLED';
      this.scoreboardVersion++;
      for (const s of this.players.values()) s.revision++;
    }
  }
  nextDue() {
    if (this.phase !== 'PLAYING') return undefined;
    let due = this.endsAt;
    for (const state of this.players.values()) {
      if (state.shot && !state.shot.resolved)
        due = Math.min(due, state.shot.resolvedAt);
      if (state.status === 'RESULT' && state.lastResult)
        due = Math.min(due, state.lastResult.resolvedAt + PHYSICS.pauseMs);
    }
    return due;
  }
  scoreboard() {
    const rows = [...this.players.values()]
      .map((s) => ({
        playerId: s.player.playerId,
        playerName: s.player.playerName,
        avatarId: s.player.avatarId,
        goals: s.goals,
        score: s.goals * 10,
      }))
      .sort((a, b) => b.score - a.score);
    return rows.map((row) => ({
      ...row,
      rank: rows.findIndex((other) => other.score === row.score) + 1,
    }));
  }
  private publicShot(shot: Shot) {
    const {
      shotId,
      attemptId,
      commandId,
      aimX,
      curve,
      path,
      shotStartedAt,
      flightMs,
    } = shot;
    return {
      shotId,
      attemptId,
      commandId,
      aimX,
      curve,
      path,
      shotStartedAt,
      flightMs,
    };
  }
  snapshot(userId: string) {
    const state = this.players.get(userId);
    const common = {
      gameId: this.gameId,
      phase: this.phase,
      startedAt: this.startedAt,
      endsAt: this.endsAt,
      physicsVersion: PHYSICS.version,
      config: PHYSICS,
      scoreboardVersion: this.scoreboardVersion,
      scoreboard: this.scoreboard(),
    };
    return state
      ? {
          ...common,
          view: 'player' as const,
          revision: state.revision,
          player: {
            playerId: userId,
            playerName: state.player.playerName,
            status: state.status,
            board: state.board,
            ...(state.shot && { shot: this.publicShot(state.shot) }),
            ...(state.lastResult && { lastResult: state.lastResult }),
          },
        }
      : { ...common, view: 'host' as const, revision: 0 };
  }
}
import { bezier as bezierAt } from './goal-kick-physics';

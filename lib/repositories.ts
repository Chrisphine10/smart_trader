import { randomUUID } from "node:crypto";
import { db, getUserById, money, type User } from "./db";
import { chooseSmartDigitContract, isForexAsset, potentialPayout, resolveDigitTrade, type Direction } from "./trading";

export type Tick = {
  asset: string;
  price: number;
  lastDigit: number;
  sequence: number;
  timestamp: string;
  history?: Array<{ price: number; timestamp: string; sequence: number; lastDigit?: number }>;
  digitStats?: Record<string, number>;
  movement?: number;
  volatility?: number;
};

export function calculateEscrowSplit(grossPayout: number, percent: number) {
  const safePercent = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const escrowFee = money((grossPayout * safePercent) / 100);
  return {
    escrowFee,
    netPayout: money(grossPayout - escrowFee),
  };
}

function tradeTypeForDirection(direction: Direction) {
  if (direction === "match" || direction === "differ") return "matches_differs";
  if (direction === "even" || direction === "odd") return "even_odd";
  return "over_under";
}

export function updateUserBalance(user: User, isDemo: boolean, nextBalance: number) {
  if (isDemo) {
    db.prepare("UPDATE users SET demo_balance = ?, balance = ?, is_demo = 1 WHERE id = ?").run(nextBalance, nextBalance, user.id);
  } else {
    db.prepare("UPDATE users SET real_balance = ?, balance = ?, is_demo = 0 WHERE id = ?").run(nextBalance, nextBalance, user.id);
  }
}

export function createManualTrade(user: User, config: { asset: string; direction: Direction; stake: number; selectedDigit?: number; isDemo: boolean; durationTicks?: number; contractMode?: "digit" | "forex" | "futures"; leverage?: number }, tick: Tick) {
  const stake = money(config.stake);
  if (stake < 0.1) throw new Error("Minimum stake amount is $0.10");
  const maxStake = Number(getAppSetting("risk.maxStake", "500"));
  if (!config.isDemo && maxStake > 0 && stake > maxStake) throw new Error(`Maximum real stake is $${maxStake}`);
  const isDemo = Boolean(config.isDemo);
  if (isDemo !== Boolean(user.is_demo)) throw new Error("Trade mode does not match active account mode");
  const openCount = db.prepare("SELECT COUNT(*) as count FROM positions WHERE user_id = ? AND is_demo = ? AND status = 'open'").get(user.id, isDemo ? 1 : 0) as { count: number };
  const maxOpen = Number(getAppSetting("risk.maxOpenPositions", "10"));
  if (!isDemo && maxOpen > 0 && openCount.count >= maxOpen) throw new Error(`Maximum open positions reached (${maxOpen})`);
  const activeBalance = isDemo ? user.demo_balance : user.real_balance;
  if (stake > activeBalance) throw new Error("Insufficient balance");
  const entryPrice = tick.price;
  const entryDigit = tick.lastDigit;
  const durationTicks = Math.max(1, Math.min(300, Number(config.durationTicks ?? 5)));
  const isPriceContract = config.contractMode === "forex" || config.contractMode === "futures";
  const leverage = Math.max(1, Math.min(50, Number(config.leverage ?? 1)));
  const selectedDigit = Number.isInteger(config.selectedDigit) ? Number(config.selectedDigit) : 5;
  if (!isPriceContract && config.direction === "over" && selectedDigit === 9) throw new Error("Cannot bet Over 9");
  if (!isPriceContract && config.direction === "under" && selectedDigit === 0) throw new Error("Cannot bet Under 0");
  if (isPriceContract && !["over", "under"].includes(config.direction)) throw new Error("Forex supports Buy or Sell only");
  const payout = isPriceContract ? money(stake + stake * leverage * 0.8) : potentialPayout(stake, config.direction, selectedDigit);
  const balanceAfterStake = money(activeBalance - stake);
  const positionId = randomUUID();
  const tradeType = isPriceContract ? "forex" : tradeTypeForDirection(config.direction);

  db.exec("BEGIN");
  try {
    db.prepare(`
      INSERT INTO positions (
        id, user_id, asset, trade_type, direction, stake, potential_payout, entry_price, entry_digit,
        exit_price, exit_digit, ticks, current_tick, status, profit_loss, is_demo, selected_digit, closed_at, balance_after
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, 0, 'open', 0, ?, ?, NULL, ?)
    `).run(positionId, user.id, config.asset, tradeType, config.direction, stake, payout, entryPrice, entryDigit, durationTicks, isDemo ? 1 : 0, selectedDigit, balanceAfterStake);

    db.prepare(`
      INSERT INTO transactions (id, user_id, position_id, type, amount, balance_after, description, asset, direction, trade_type, position_stake, profit_loss)
      VALUES (?, ?, ?, 'stake', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), user.id, positionId, -stake, balanceAfterStake, `${isPriceContract ? `Forex ${config.direction === "over" ? "BUY" : "SELL"} ${leverage}x` : `Stake placed on ${config.asset} - ${config.direction.toUpperCase()}`} for ${durationTicks} ticks`, config.asset, config.direction, tradeType, stake, 0);

    updateUserBalance(user, isDemo, balanceAfterStake);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return getPosition(positionId);
}

export function settleOpenPositions(userId: string, asset: string, tick: Tick) {
  const rows = db.prepare("SELECT * FROM positions WHERE user_id = ? AND asset = ? AND status = 'open' ORDER BY created_at ASC").all(userId, asset) as Array<Record<string, unknown>>;
  const updates: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    const positionId = String(row.id);
    const nextTick = Number(row.current_tick ?? 0) + 1;
    const durationTicks = Number(row.ticks ?? 1);
    if (nextTick < durationTicks) {
      db.prepare("UPDATE positions SET current_tick = ? WHERE id = ?").run(nextTick, positionId);
      updates.push(getPosition(positionId) as Record<string, unknown>);
      continue;
    }

    const user = getFreshUser(userId);
    const isDemo = Boolean(row.is_demo);
    const activeBalance = isDemo ? user.demo_balance : user.real_balance;
    const stake = Number(row.stake);
    const grossPayout = Number(row.potential_payout);
    const direction = String(row.direction) as Direction;
    const selectedDigit = Number(row.selected_digit ?? 5);
    const isPriceContract = ["forex", "futures"].includes(String(row.trade_type));
    const won = isPriceContract
      ? direction === "over" ? tick.price > Number(row.entry_price ?? tick.price) : tick.price < Number(row.entry_price ?? tick.price)
      : resolveDigitTrade(direction, selectedDigit, tick.lastDigit);
    const escrowPercent = Number(getAppSetting("escrow.winPayoutPercent", "10"));
    const escrowAddress = getAppSetting("escrow.bitcoinAddress", "bitcoin:BC1Q2JYAXPRTDMWVGY6E6YKX2E9K9RYSRG68DZ528W");
    const { escrowFee, netPayout } = won ? calculateEscrowSplit(grossPayout, escrowPercent) : { escrowFee: 0, netPayout: 0 };
    const profitLoss = won ? money(netPayout - stake) : money(-stake);
    const balanceAfter = won ? money(activeBalance + netPayout) : money(activeBalance);
    const status = won ? "won" : "lost";

    db.exec("BEGIN");
    try {
      db.prepare(`
        UPDATE positions
        SET current_tick = ?, exit_price = ?, exit_digit = ?, status = ?, profit_loss = ?, closed_at = CURRENT_TIMESTAMP, balance_after = ?
        WHERE id = ?
      `).run(durationTicks, tick.price, tick.lastDigit, status, profitLoss, balanceAfter, positionId);

      db.prepare(`
        INSERT INTO transactions (id, user_id, position_id, type, amount, balance_after, description, asset, direction, trade_type, position_stake, profit_loss)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        userId,
        positionId,
        won ? "payout" : "loss",
        won ? netPayout : 0,
        balanceAfter,
        isPriceContract
          ? won ? `Forex ${direction === "over" ? "BUY" : "SELL"} closed in profit at ${tick.price.toFixed(5)}` : `Forex ${direction === "over" ? "BUY" : "SELL"} closed at a loss at ${tick.price.toFixed(5)}`
          : won ? `Won on ${asset} - ${direction.toUpperCase()} at digit ${tick.lastDigit}` : `Lost on ${asset} - ${direction.toUpperCase()} at digit ${tick.lastDigit}`,
        asset,
        direction,
        String(row.trade_type),
        stake,
        profitLoss,
      );

      if (won && escrowFee > 0) {
        db.prepare(`
          INSERT INTO transactions (id, user_id, position_id, type, amount, balance_after, description, asset, direction, trade_type, position_stake, profit_loss)
          VALUES (?, ?, ?, 'system_escrow_fee', ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          randomUUID(),
          userId,
          positionId,
          -escrowFee,
          balanceAfter,
          `System escrow split ${escrowPercent}% of gross payout $${grossPayout.toFixed(2)} to BTC ${escrowAddress}`,
          asset,
          direction,
          String(row.trade_type),
          stake,
          -escrowFee,
        );
      }

      updateUserBalance(user, isDemo, balanceAfter);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    updates.push(getPosition(positionId) as Record<string, unknown>);
  }

  return updates;
}

export function getPosition(id: string) {
  return db.prepare("SELECT * FROM positions WHERE id = ?").get(id);
}

export function listPositions(userId: string, isDemo: boolean) {
  return db.prepare("SELECT * FROM positions WHERE user_id = ? AND is_demo = ? ORDER BY created_at DESC LIMIT 60").all(userId, isDemo ? 1 : 0);
}

export function listTransactions(userId: string, limit = 40) {
  return db.prepare(`
    SELECT
      t.*,
      p.stake AS linked_stake,
      p.potential_payout AS linked_potential_payout,
      p.profit_loss AS linked_profit_loss,
      p.status AS linked_position_status
    FROM transactions t
    LEFT JOIN positions p ON p.id = t.position_id
    WHERE t.user_id = ?
    ORDER BY t.created_at DESC
    LIMIT ?
  `).all(userId, limit);
}

export function startAutoSession(user: User, config: { direction: Direction; stake: number; targetProfit?: number; targetLoss?: number; lossMultiple?: number; asset: string; isDemo: boolean; selectedDigit?: number; strategy?: string; maxTrades?: number; durationTicks?: number; contractMode?: "digit" | "forex"; leverage?: number }) {
  if (Boolean(config.isDemo) !== Boolean(user.is_demo)) throw new Error("Bot mode does not match active account mode");
  db.prepare("UPDATE auto_trading_sessions SET active = 0, stopped_at = CURRENT_TIMESTAMP, stop_reason = 'replaced' WHERE user_id = ? AND active = 1").run(user.id);
  const activeRealBots = db.prepare("SELECT COUNT(*) as count FROM auto_trading_sessions WHERE user_id = ? AND is_demo = 0 AND active = 1").get(user.id) as { count: number };
  const maxBotSessions = Number(getAppSetting("risk.maxBotSessions", "1"));
  if (!config.isDemo && maxBotSessions > 0 && activeRealBots.count >= maxBotSessions) throw new Error(`Maximum real bot sessions reached (${maxBotSessions})`);
  const id = randomUUID();
  const isForex = config.contractMode === "forex" || isForexAsset(config.asset);
  const leverage = Math.max(1, Math.min(50, Number(config.leverage ?? 1)));
  if (isForex && !["over", "under"].includes(config.direction)) throw new Error("Forex auto supports Buy or Sell only");
  const tradeType = isForex ? "forex" : tradeTypeForDirection(config.direction);
  db.prepare(`
    INSERT INTO auto_trading_sessions (
      id, user_id, active, mode, direction, original_stake, current_stake, target_profit, target_loss,
      loss_multiple, asset, is_demo, selected_digit, trade_type, strategy, max_trades, duration_ticks, leverage
    ) VALUES (?, ?, 1, 'auto', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    user.id,
    config.direction,
    money(config.stake),
    money(config.stake),
    config.targetProfit ? money(config.targetProfit) : null,
    config.targetLoss ? money(config.targetLoss) : null,
    config.lossMultiple ? money(config.lossMultiple) : 1,
    config.asset,
    config.isDemo ? 1 : 0,
    config.selectedDigit ?? 5,
    tradeType,
    config.strategy ?? (isForex ? "forex_trend" : "smart"),
    Math.max(1, Math.min(500, Number(config.maxTrades ?? 25))),
    Math.max(1, Math.min(300, Number(config.durationTicks ?? 5))),
    leverage,
  );
  return getAutoSession(user.id);
}

export function getAutoSession(userId: string) {
  const row = db.prepare("SELECT * FROM auto_trading_sessions WHERE user_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 1").get(userId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    active: Boolean(row.active),
    mode: row.mode,
    direction: row.direction,
    originalStake: row.original_stake,
    currentStake: row.current_stake,
    targetProfit: row.target_profit,
    targetLoss: row.target_loss,
    lossMultiple: row.loss_multiple,
    asset: row.asset,
    isDemo: Boolean(row.is_demo),
    sessionPL: row.session_pl,
    waitingForClose: Boolean(row.waiting_for_close),
    isProcessing: Boolean(row.is_processing),
    hasOpenPosition: Boolean(row.has_open_position),
    selectedDigit: row.selected_digit,
    tradeType: row.trade_type,
    strategy: row.strategy,
    maxTrades: row.max_trades,
    durationTicks: row.duration_ticks,
    leverage: row.leverage,
    stopReason: row.stop_reason,
    startedAt: row.started_at,
    tradesCount: row.trades_count,
    winsCount: row.wins_count,
    lossesCount: row.losses_count,
  };
}

export function stopAutoSession(userId: string, reason = "manual_stop") {
  db.prepare("UPDATE auto_trading_sessions SET active = 0, stopped_at = CURRENT_TIMESTAMP, stop_reason = ? WHERE user_id = ? AND active = 1").run(reason, userId);
  return getAutoSession(userId);
}

export function updateAutoSessionSettings(userId: string, config: { durationTicks?: number }) {
  const durationTicks = Math.max(1, Math.min(300, Number(config.durationTicks ?? 5)));
  db.prepare("UPDATE auto_trading_sessions SET duration_ticks = ? WHERE user_id = ? AND active = 1").run(durationTicks, userId);
  return getAutoSession(userId);
}

export function recordAutoSettlement(userId: string, closedPositions: Array<Record<string, unknown>>) {
  const session = db.prepare("SELECT * FROM auto_trading_sessions WHERE user_id = ? AND active = 1 ORDER BY started_at DESC, rowid DESC LIMIT 1").get(userId) as Record<string, unknown> | undefined;
  if (!session?.has_open_position || closedPositions.length === 0) return getAutoSession(userId);

  const relevant = closedPositions.find((position) =>
    String(position.asset) === String(session.asset) &&
    Number(position.is_demo) === Number(session.is_demo) &&
    String(position.direction) === String(session.direction) &&
    Number(position.selected_digit) === Number(session.selected_digit)
  );
  if (!relevant) return getAutoSession(userId);

  const profitLoss = money(Number(relevant.profit_loss ?? 0));
  const won = profitLoss >= 0;
  const sessionPL = money(Number(session.session_pl ?? 0) + profitLoss);
  const originalStake = money(Number(session.original_stake ?? 0.1));
  const strategy = String(session.strategy ?? "smart");
  const lossesAfter = Number(session.losses_count ?? 0) + (won ? 0 : 1);
  const currentStake = strategy === "smart"
    ? smartNextStake(originalStake, won, lossesAfter)
    : won ? originalStake : money(Number(session.current_stake ?? originalStake) * Number(session.loss_multiple ?? 1));
  const targetProfit = Number(session.target_profit ?? 0);
  const targetLoss = Number(session.target_loss ?? 0);
  const shouldStopProfit = targetProfit > 0 && sessionPL >= targetProfit;
  const shouldStopLoss = targetLoss > 0 && Math.abs(Math.min(sessionPL, 0)) >= targetLoss;
  const stopReason = shouldStopProfit ? "target_profit" : shouldStopLoss ? "target_loss" : null;
  const maxTrades = Number(session.max_trades ?? 25);
  const tradesCount = Number(session.trades_count ?? 0);
  const finalStopReason = stopReason ?? (tradesCount >= maxTrades ? "max_trades" : null);

  db.prepare(`
    UPDATE auto_trading_sessions
    SET session_pl = ?, current_stake = ?, waiting_for_close = 0, is_processing = 0, has_open_position = 0,
        wins_count = wins_count + ?, losses_count = losses_count + ?, active = ?, stopped_at = CASE WHEN ? IS NULL THEN stopped_at ELSE CURRENT_TIMESTAMP END,
        stop_reason = COALESCE(?, stop_reason)
    WHERE id = ?
  `).run(sessionPL, currentStake, won ? 1 : 0, won ? 0 : 1, finalStopReason ? 0 : 1, finalStopReason, finalStopReason, String(session.id));

  return getAutoSession(userId);
}

export function maybeCreateAutoTrade(userId: string, tick: Tick) {
  const session = db.prepare("SELECT * FROM auto_trading_sessions WHERE user_id = ? AND active = 1 ORDER BY started_at DESC, rowid DESC LIMIT 1").get(userId) as Record<string, unknown> | undefined;
  if (!session || String(session.asset) !== tick.asset || Number(session.has_open_position) === 1) return null;

  const user = getFreshUser(userId);
  const strategy = String(session.strategy ?? "smart");
  const isForex = String(session.trade_type) === "forex" || isForexAsset(String(session.asset));
  const decision = isForex
    ? { direction: String(session.direction) as Direction, selectedDigit: Number(session.selected_digit ?? 5) }
    : strategy === "smart"
    ? chooseSmartDigitContract(tick, String(session.direction) as Direction, Number(session.selected_digit ?? 5))
    : { direction: String(session.direction) as Direction, selectedDigit: Number(session.selected_digit ?? 5) };
  const baseStake = money(Number(session.current_stake ?? session.original_stake ?? 0));
  const activeBalance = Number(session.is_demo) === 1 ? user.demo_balance : user.real_balance;
  const stake = strategy === "smart" ? money(Math.min(baseStake, Math.max(0.1, activeBalance * 0.03))) : baseStake;
  if (stake < 0.1 || stake > activeBalance) {
    stopAutoSession(userId, "insufficient_balance");
    return null;
  }

  const position = createManualTrade(user, {
    asset: tick.asset,
    direction: decision.direction,
    stake,
    selectedDigit: decision.selectedDigit,
    isDemo: Number(session.is_demo) === 1,
    durationTicks: Number(session.duration_ticks ?? 5),
    contractMode: isForex ? "forex" : "digit",
    leverage: Number(session.leverage ?? 1),
  }, tick) as Record<string, unknown>;

  db.prepare(`
    UPDATE auto_trading_sessions
    SET direction = ?, selected_digit = ?, trade_type = ?, current_stake = ?, waiting_for_close = 1,
        is_processing = 0, has_open_position = 1, trades_count = trades_count + 1
    WHERE id = ?
  `).run(decision.direction, decision.selectedDigit, isForex ? "forex" : tradeTypeForDirection(decision.direction), stake, String(session.id));
  return position;
}

function smartNextStake(originalStake: number, won: boolean, lossesAfter: number) {
  if (won) return originalStake;
  if (lossesAfter >= 3) return money(Math.max(0.1, originalStake * 0.5));
  return money(Math.max(0.1, originalStake * 0.75));
}

export function recordDeposit(user: User, method: string, amount: number, isDemo = Boolean(user.is_demo)) {
  const id = randomUUID();
  const next = money((isDemo ? user.demo_balance : user.real_balance) + amount);
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO deposits (id, user_id, method, amount, status, reference, completed_at, is_demo, provider_status) VALUES (?, ?, ?, ?, 'completed', ?, CURRENT_TIMESTAMP, ?, 'sandbox_approved')").run(id, user.id, method, amount, `${method.toUpperCase()}-${Date.now()}`, isDemo ? 1 : 0);
    db.prepare("INSERT INTO transactions (id, user_id, type, amount, balance_after, description) VALUES (?, ?, 'deposit', ?, ?, ?)").run(randomUUID(), user.id, amount, next, `Sandbox ${method} ${isDemo ? "demo" : "real"} deposit`);
    updateUserBalance(user, isDemo, next);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { id, amount, balance: next };
}

export function recordPendingDeposit(user: User, method: string, amount: number, reference: string, checkoutUrl?: string, phone?: string) {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO deposits (id, user_id, method, amount, status, reference, provider_reference, checkout_url, phone, is_demo, provider_status)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, 0, 'initiated')
  `).run(id, user.id, method, amount, reference, reference, checkoutUrl ?? null, phone ?? null);
  return { id, amount, status: "pending", reference, checkoutUrl };
}

export function confirmProviderDeposit(input: { provider: string; reference: string; eventId?: string; status: "success" | "failed"; payload?: unknown; failureReason?: string }) {
  const deposit = db.prepare("SELECT * FROM deposits WHERE (provider_reference = ? OR reference = ?) AND method = ? ORDER BY created_at DESC LIMIT 1").get(input.reference, input.reference, input.provider) as Record<string, unknown> | undefined;
  if (!deposit) throw new Error("Deposit not found for provider reference");
  if (String(deposit.status) === "completed") return { deposit, credited: false, duplicate: true };
  if (String(deposit.status) !== "pending") return { deposit, credited: false, duplicate: true };
  if (input.eventId) {
    const duplicate = db.prepare("SELECT id FROM deposits WHERE provider_event_id = ? AND id <> ?").get(input.eventId, String(deposit.id));
    if (duplicate) return { deposit, credited: false, duplicate: true };
  }

  const payload = input.payload ? JSON.stringify(input.payload).slice(0, 5000) : null;
  const user = getFreshUser(String(deposit.user_id));
  db.exec("BEGIN");
  try {
    if (input.status === "success") {
      const next = money(user.real_balance + Number(deposit.amount ?? 0));
      db.prepare(`
        UPDATE deposits
        SET status = 'completed', completed_at = CURRENT_TIMESTAMP, provider_event_id = ?, provider_status = 'success',
            callback_payload = ?, failure_reason = NULL
        WHERE id = ?
      `).run(input.eventId ?? null, payload, String(deposit.id));
      db.prepare("INSERT INTO transactions (id, user_id, type, amount, balance_after, description) VALUES (?, ?, 'deposit', ?, ?, ?)").run(randomUUID(), user.id, Number(deposit.amount ?? 0), next, `${input.provider.toUpperCase()} deposit confirmed by provider`);
      updateUserBalance(user, false, next);
      audit(null, "provider", `${input.provider}_deposit_confirmed`, "deposit", String(deposit.id), { eventId: input.eventId, reference: input.reference });
    } else {
      db.prepare(`
        UPDATE deposits
        SET status = 'failed', provider_event_id = ?, provider_status = 'failed', callback_payload = ?, failure_reason = ?, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(input.eventId ?? null, payload, input.failureReason ?? "Provider reported failed payment", String(deposit.id));
      audit(null, "provider", `${input.provider}_deposit_failed`, "deposit", String(deposit.id), { eventId: input.eventId, reference: input.reference, reason: input.failureReason });
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { deposit: db.prepare("SELECT * FROM deposits WHERE id = ?").get(String(deposit.id)), credited: input.status === "success", duplicate: false };
}

export function listAppSettings() {
  const rows = db.prepare("SELECT key, value FROM app_settings").all() as Array<{ key: string; value: string }>;
  return rows.reduce<Record<string, string>>((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

export function getAppSetting(key: string, fallback = "") {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
}

export function updateAppSettings(values: Record<string, string>) {
  const stmt = db.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  Object.entries(values).forEach(([key, value]) => stmt.run(key, value));
  return listAppSettings();
}

export function listRiskSettings() {
  const settings = listAppSettings();
  return Object.fromEntries(Object.entries(settings).filter(([key]) => key.startsWith("risk.") || key.startsWith("escrow.")));
}

export function updateRiskSettings(values: Record<string, string>) {
  const allowed = new Set(["risk.maxStake", "risk.maxOpenPositions", "risk.maxBotSessions", "risk.dailyWithdrawalLimit", "risk.maxWithdrawal", "escrow.bitcoinAddress", "escrow.winPayoutPercent"]);
  return updateAppSettings(Object.fromEntries(Object.entries(values).filter(([key]) => allowed.has(key))));
}

export function submitKyc(user: User, input: { fullName: string; documentType: string; documentNumber: string; country: string; notes?: string }) {
  const id = randomUUID();
  db.exec("BEGIN");
  try {
    db.prepare(`
      INSERT INTO kyc_submissions (id, user_id, level, status, full_name, document_type, document_number, country, notes)
      VALUES (?, ?, 'basic', 'submitted', ?, ?, ?, ?, ?)
    `).run(id, user.id, input.fullName, input.documentType, input.documentNumber, input.country || "KE", input.notes ?? null);
    db.prepare("UPDATE users SET kyc_status = 'submitted' WHERE id = ?").run(user.id);
    audit(user.id, "user", "kyc_submitted", "kyc_submission", id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return db.prepare("SELECT * FROM kyc_submissions WHERE id = ?").get(id);
}

export function listKycSubmissions(status = "") {
  return db.prepare(`
    SELECT kyc_submissions.*, users.email, users.username, users.kyc_status
    FROM kyc_submissions
    JOIN users ON users.id = kyc_submissions.user_id
    WHERE (? = '' OR kyc_submissions.status = ?)
    ORDER BY kyc_submissions.created_at DESC
    LIMIT 120
  `).all(status, status);
}

export function reviewKyc(adminId: string, submissionId: string, status: "approved" | "rejected" | "restricted", notes = "") {
  const submission = db.prepare("SELECT * FROM kyc_submissions WHERE id = ?").get(submissionId) as Record<string, unknown> | undefined;
  if (!submission) throw new Error("KYC submission not found");
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE kyc_submissions SET status = ?, admin_notes = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, notes, submissionId);
    db.prepare("UPDATE users SET kyc_status = ? WHERE id = ?").run(status, String(submission.user_id));
    audit(adminId, "admin", `kyc_${status}`, "kyc_submission", submissionId, { notes });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return db.prepare("SELECT * FROM kyc_submissions WHERE id = ?").get(submissionId);
}

export function submitWithdrawal(user: User, method: string, amount: number, walletAddress?: string) {
  const minWithdrawal = Number(getAppSetting("payments.minWithdrawal", "1"));
  if (amount < minWithdrawal) throw new Error(`Minimum withdrawal is $${minWithdrawal}`);
  const isDemo = Boolean(user.is_demo);
  if (!isDemo && (user.kyc_status ?? "unverified") !== "approved") throw new Error("KYC approval is required before withdrawals");
  const maxWithdrawal = Number(getAppSetting("risk.maxWithdrawal", "5000"));
  if (!isDemo && maxWithdrawal > 0 && amount > maxWithdrawal) throw new Error(`Maximum withdrawal is $${maxWithdrawal}`);
  const dailyLimit = Number(getAppSetting("risk.dailyWithdrawalLimit", "1000"));
  if (!isDemo && dailyLimit > 0) {
    const daily = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM withdrawals WHERE user_id = ? AND is_demo = 0 AND status IN ('pending', 'completed') AND date(created_at) = date('now')").get(user.id) as { total: number };
    if (daily.total + amount > dailyLimit) throw new Error(`Daily withdrawal limit is $${dailyLimit}`);
  }
  const currentBalance = isDemo ? user.demo_balance : user.real_balance;
  if (amount > currentBalance) throw new Error("Insufficient balance");
  const id = randomUUID();
  const next = money(currentBalance - amount);
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO withdrawals (id, user_id, method, amount, wallet_address, status, completed_at, is_demo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id, user.id, method, amount, walletAddress ?? null, isDemo ? "completed" : "pending", isDemo ? new Date().toISOString() : null, isDemo ? 1 : 0);
    db.prepare("INSERT INTO transactions (id, user_id, type, amount, balance_after, description) VALUES (?, ?, 'withdrawal', ?, ?, ?)").run(randomUUID(), user.id, -amount, next, `${isDemo ? "Sandbox demo" : "Manual review"} ${method} withdrawal submitted`);
    updateUserBalance(user, isDemo, next);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { id, amount, status: "pending", balance: next };
}

export function listPaymentOperations() {
  const deposits = db.prepare(`
    SELECT deposits.*, users.email, users.username
    FROM deposits
    JOIN users ON users.id = deposits.user_id
    ORDER BY deposits.created_at DESC
    LIMIT 120
  `).all();
  const withdrawals = db.prepare(`
    SELECT withdrawals.*, users.email, users.username
    FROM withdrawals
    JOIN users ON users.id = withdrawals.user_id
    ORDER BY withdrawals.created_at DESC
    LIMIT 120
  `).all();
  return { deposits, withdrawals };
}

export function reviewDeposit(adminId: string, depositId: string, action: "approve" | "reject", notes = "") {
  const deposit = db.prepare("SELECT * FROM deposits WHERE id = ?").get(depositId) as Record<string, unknown> | undefined;
  if (!deposit) throw new Error("Deposit not found");
  if (String(deposit.status) !== "pending") throw new Error("Only pending deposits can be reviewed");
  const status = action === "approve" ? "completed" : "rejected";
  const user = getFreshUser(String(deposit.user_id));

  db.exec("BEGIN");
  try {
    if (action === "approve") {
      if (String(deposit.provider_status ?? "") === "initiated") throw new Error("Live provider deposits must be credited by verified callback/webhook");
      const next = money(user.real_balance + Number(deposit.amount ?? 0));
      db.prepare("UPDATE deposits SET status = 'completed', completed_at = CURRENT_TIMESTAMP, reviewed_at = CURRENT_TIMESTAMP, admin_notes = ? WHERE id = ?").run(notes, depositId);
      db.prepare("INSERT INTO transactions (id, user_id, type, amount, balance_after, description) VALUES (?, ?, 'deposit', ?, ?, ?)").run(randomUUID(), user.id, Number(deposit.amount ?? 0), next, `Admin approved ${deposit.method} deposit`);
      updateUserBalance(user, false, next);
    } else {
      db.prepare("UPDATE deposits SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP, admin_notes = ? WHERE id = ?").run(notes, depositId);
    }
    audit(adminId, "admin", `deposit_${status}`, "deposit", depositId, { notes });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return db.prepare("SELECT * FROM deposits WHERE id = ?").get(depositId);
}

export function reviewWithdrawal(adminId: string, withdrawalId: string, action: "approve" | "reject", notes = "", reference = "") {
  const withdrawal = db.prepare("SELECT * FROM withdrawals WHERE id = ?").get(withdrawalId) as Record<string, unknown> | undefined;
  if (!withdrawal) throw new Error("Withdrawal not found");
  if (String(withdrawal.status) !== "pending") throw new Error("Only pending withdrawals can be reviewed");
  const user = getFreshUser(String(withdrawal.user_id));

  db.exec("BEGIN");
  try {
    if (action === "approve") {
      db.prepare("UPDATE withdrawals SET status = 'completed', completed_at = CURRENT_TIMESTAMP, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?, admin_notes = ?, reference = ? WHERE id = ?").run(adminId, notes, reference || `WD-${Date.now()}`, withdrawalId);
    } else {
      const next = money(user.real_balance + Number(withdrawal.amount ?? 0));
      db.prepare("UPDATE withdrawals SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?, admin_notes = ?, reference = ? WHERE id = ?").run(adminId, notes, reference || null, withdrawalId);
      db.prepare("INSERT INTO transactions (id, user_id, type, amount, balance_after, description) VALUES (?, ?, 'withdrawal_refund', ?, ?, ?)").run(randomUUID(), user.id, Number(withdrawal.amount ?? 0), next, `Rejected ${withdrawal.method} withdrawal refunded`);
      updateUserBalance(user, false, next);
    }
    audit(adminId, "admin", `withdrawal_${action}`, "withdrawal", withdrawalId, { notes, reference });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return db.prepare("SELECT * FROM withdrawals WHERE id = ?").get(withdrawalId);
}

export function ensureConversation(userId: string) {
  const existing = db.prepare("SELECT * FROM chat_conversations WHERE user_id = ?").get(userId);
  if (existing) return existing;
  const id = randomUUID();
  db.prepare("INSERT INTO chat_conversations (id, user_id) VALUES (?, ?)").run(id, userId);
  db.prepare("INSERT INTO chat_messages (id, conversation_id, user_id, sender_type, message) VALUES (?, ?, ?, 'admin', ?)").run(randomUUID(), id, userId, "Welcome to Hydra Trade support. How can we help?");
  return db.prepare("SELECT * FROM chat_conversations WHERE id = ?").get(id);
}

export function addChatMessage(conversationId: string, userId: string, message: string, senderType = "user") {
  const id = randomUUID();
  db.prepare("INSERT INTO chat_messages (id, conversation_id, user_id, sender_type, message) VALUES (?, ?, ?, ?, ?)").run(id, conversationId, userId, senderType, message);
  db.prepare("UPDATE chat_conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?").run(conversationId);
  return db.prepare("SELECT * FROM chat_messages WHERE id = ?").get(id);
}

export function listSupportConversations() {
  return db.prepare(`
    SELECT conversations.*, users.email, users.username, users.real_balance, users.demo_balance, users.is_demo,
      (SELECT message FROM chat_messages WHERE conversation_id = conversations.id ORDER BY created_at DESC LIMIT 1) AS last_message,
      (SELECT COUNT(*) FROM chat_messages WHERE conversation_id = conversations.id AND sender_type = 'user') AS user_messages
    FROM chat_conversations conversations
    JOIN users ON users.id = conversations.user_id
    ORDER BY conversations.last_message_at DESC
    LIMIT 80
  `).all();
}

export function listSupportMessages(conversationId: string) {
  return db.prepare("SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC").all(conversationId);
}

export function addAdminSupportMessage(conversationId: string, adminId: string, message: string) {
  const conversation = db.prepare("SELECT user_id FROM chat_conversations WHERE id = ?").get(conversationId) as { user_id: string } | undefined;
  if (!conversation) throw new Error("Conversation not found");
  return addChatMessage(conversationId, conversation.user_id, message, "admin");
}

export function adminStats() {
  const users = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
  const deposits = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM deposits WHERE status = 'completed'").get() as { total: number };
  const withdrawals = db.prepare("SELECT COUNT(*) as count FROM withdrawals WHERE status = 'pending'").get() as { count: number };
  const trades = db.prepare("SELECT COUNT(*) as count FROM positions").get() as { count: number };
  const escrowFees = db.prepare("SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM transactions WHERE type = 'system_escrow_fee'").get() as { total: number };
  return { users: users.count, depositVolume: deposits.total, pendingWithdrawals: withdrawals.count, trades: trades.count, escrowFees: escrowFees.total };
}

export function getFreshUser(id: string) {
  const user = getUserById(id);
  if (!user) throw new Error("Unauthorized");
  return user;
}

const defaultPaymentMethods = "M-Pesa,Bank Transfer,Paystack,Airtel Money,Cash";
const terminalP2PStatuses = new Set(["released", "cancelled", "expired", "refunded", "resolved_no_action"]);

type P2PAdFilters = {
  side?: string;
  asset?: string;
  fiatCurrency?: string;
  paymentMethod?: string;
  minFiat?: number;
  maxFiat?: number;
  sort?: string;
};

export function listP2PAds(sideOrFilters?: string | P2PAdFilters, asset = "USDT") {
  const filters: P2PAdFilters = typeof sideOrFilters === "object" ? sideOrFilters : { side: sideOrFilters, asset };
  const side = filters.side === "buy" ? "buy" : filters.side === "sell" ? "sell" : "";
  const assetSymbol = String(filters.asset ?? asset ?? "USDT").toUpperCase();
  const fiatCurrency = String(filters.fiatCurrency ?? "").toUpperCase();
  const paymentMethod = String(filters.paymentMethod ?? "").trim();
  const minFiat = Number(filters.minFiat ?? 0);
  const maxFiat = Number(filters.maxFiat ?? 0);
  const sort = String(filters.sort ?? "newest");
  const orderBy = sort === "price_asc" ? "p2p_ads.price ASC" : sort === "price_desc" ? "p2p_ads.price DESC" : "p2p_ads.created_at DESC";
  const rows = db.prepare(`
    SELECT p2p_ads.*, users.username,
      COALESCE(stats.completed_orders, 0) AS completed_orders,
      COALESCE(stats.total_orders, 0) AS total_orders,
      COALESCE(stats.dispute_count, 0) AS dispute_count,
      COALESCE(stats.avg_release_minutes, 0) AS avg_release_minutes
    FROM p2p_ads
    JOIN users ON users.id = p2p_ads.user_id
    LEFT JOIN (
      SELECT maker_id,
        COUNT(*) AS total_orders,
        SUM(CASE WHEN status = 'released' THEN 1 ELSE 0 END) AS completed_orders,
        SUM(CASE WHEN status = 'disputed' THEN 1 ELSE 0 END) AS dispute_count,
        AVG(CASE WHEN released_at IS NOT NULL AND paid_at IS NOT NULL THEN (julianday(released_at) - julianday(paid_at)) * 24 * 60 ELSE NULL END) AS avg_release_minutes
      FROM (
        SELECT ads.user_id AS maker_id, orders.status, orders.released_at, orders.paid_at
        FROM p2p_orders orders
        JOIN p2p_ads ads ON ads.id = orders.ad_id
      )
      GROUP BY maker_id
    ) stats ON stats.maker_id = p2p_ads.user_id
    WHERE p2p_ads.status = 'active'
      AND (? = '' OR p2p_ads.side = ?)
      AND (? = '' OR p2p_ads.asset_symbol = ?)
      AND (? = '' OR p2p_ads.fiat_currency = ?)
      AND (? = '' OR p2p_ads.payment_methods LIKE ?)
      AND (? <= 0 OR p2p_ads.max_limit >= ?)
      AND (? <= 0 OR p2p_ads.min_limit <= ?)
    ORDER BY ${orderBy}
    LIMIT 50
  `).all(side, side, assetSymbol, assetSymbol, fiatCurrency, fiatCurrency, paymentMethod, `%${paymentMethod}%`, minFiat, minFiat, maxFiat, maxFiat) as Array<Record<string, unknown>>;

  if (rows.length > 0) return rows.map(formatP2PAd);
  return seedP2PPreviewAds(side, assetSymbol);
}

export function createP2PAd(user: User, input: { side: string; assetSymbol: string; fiatCurrency: string; price: number; availableAmount: number; minLimit: number; maxLimit: number; paymentMethods: string; terms?: string }) {
  if ((user.kyc_status ?? "unverified") !== "approved") throw new Error("KYC approval is required before creating P2P ads");
  const side = input.side === "buy" ? "buy" : "sell";
  const assetSymbol = String(input.assetSymbol || "USDT").toUpperCase();
  const fiatCurrency = String(input.fiatCurrency || "KES").toUpperCase();
  const price = money(input.price);
  const availableAmount = money(input.availableAmount);
  const minLimit = money(input.minLimit || 1);
  const maxLimit = money(input.maxLimit || price || 1);
  if (price <= 0) throw new Error("P2P price must be greater than zero");
  if (availableAmount <= 0) throw new Error("P2P available amount must be greater than zero");
  if (minLimit <= 0 || maxLimit < minLimit) throw new Error("Invalid P2P fiat limits");
  const paymentMethods = parsePaymentMethods(input.paymentMethods);
  if (paymentMethods.length === 0) throw new Error("At least one payment method is required");
  const id = randomUUID();
  db.exec("BEGIN");
  try {
    if (side === "sell") lockCrypto(user.id, assetSymbol, availableAmount, id, "p2p_ad_lock", `Locked ${availableAmount} ${assetSymbol} for P2P sell ad`);
    db.prepare(`
      INSERT INTO p2p_ads (id, user_id, side, asset_symbol, fiat_currency, price, available_amount, min_limit, max_limit, payment_methods, terms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      user.id,
      side,
      assetSymbol,
      fiatCurrency,
      price,
      availableAmount,
      minLimit,
      maxLimit,
      paymentMethods.join(","),
      input.terms ?? "Fast local settlement. Keep proof of payment.",
    );
    audit(user.id, "user", "p2p_ad_created", "p2p_ad", id, input);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return formatP2PAd(db.prepare("SELECT p2p_ads.*, users.username FROM p2p_ads JOIN users ON users.id = p2p_ads.user_id WHERE p2p_ads.id = ?").get(id) as Record<string, unknown>);
}

export function createP2POrder(user: User, input: { adId: string; assetAmount: number; paymentMethod: string }) {
  if ((user.kyc_status ?? "unverified") !== "approved") throw new Error("KYC approval is required before P2P trading");
  if (input.adId.startsWith("preview-")) throw new Error("Preview ads are for marketplace discovery only");
  const ad = db.prepare("SELECT * FROM p2p_ads WHERE id = ? AND status = 'active'").get(input.adId) as Record<string, unknown> | undefined;
  if (!ad) throw new Error("P2P ad not found");
  const assetAmount = money(input.assetAmount);
  if (assetAmount <= 0) throw new Error("Order amount must be greater than zero");
  const available = Number(ad.available_amount ?? 0);
  if (assetAmount > available) throw new Error("Amount exceeds ad availability");

  const adSide = String(ad.side);
  const makerId = String(ad.user_id);
  if (makerId === user.id) throw new Error("You cannot trade with your own P2P ad");
  const buyerId = adSide === "sell" ? user.id : makerId;
  const sellerId = adSide === "sell" ? makerId : user.id;
  const fiatAmount = money(assetAmount * Number(ad.price ?? 0));
  if (fiatAmount < Number(ad.min_limit ?? 0) || fiatAmount > Number(ad.max_limit ?? 0)) throw new Error("Order amount is outside ad limits");
  const assetSymbol = String(ad.asset_symbol ?? "USDT");
  const fiatCurrency = String(ad.fiat_currency ?? "KES");
  const methods = parsePaymentMethods(String(ad.payment_methods ?? defaultPaymentMethods));
  const paymentMethod = input.paymentMethod || methods[0] || "M-Pesa";
  if (!methods.includes(paymentMethod)) throw new Error("Payment method is not available for this ad");
  const id = randomUUID();

  db.exec("BEGIN");
  try {
    if (adSide === "buy") lockCrypto(user.id, assetSymbol, assetAmount, id, "p2p_order_lock", `Locked ${assetAmount} ${assetSymbol} for P2P order`);
    db.prepare(`
      INSERT INTO p2p_orders (id, ad_id, buyer_id, seller_id, asset_symbol, fiat_currency, asset_amount, fiat_amount, payment_method, status, expires_at, fee_amount, fee_asset)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'escrow_locked', datetime('now', '+30 minutes'), 0, ?)
    `).run(id, input.adId, buyerId, sellerId, assetSymbol, fiatCurrency, assetAmount, fiatAmount, paymentMethod, assetSymbol);
    db.prepare("UPDATE p2p_ads SET available_amount = available_amount - ?, status = CASE WHEN available_amount - ? <= 0 THEN 'filled' ELSE status END WHERE id = ?").run(assetAmount, assetAmount, input.adId);
    audit(user.id, "user", "p2p_order_opened", "p2p_order", id, input);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getP2POrder(id);
}

export function markP2PPaid(user: User, orderId: string, reference: string, proofNote?: string) {
  const order = getP2POrder(orderId) as Record<string, unknown>;
  if (!order || String(order.buyer_id) !== user.id) throw new Error("Only the buyer can mark payment sent");
  if (String(order.status) !== "escrow_locked") throw new Error("Only escrow-locked orders can be marked paid");
  if (!reference.trim()) throw new Error("Payment reference is required");
  db.prepare("UPDATE p2p_orders SET status = 'payment_sent', payment_reference = ?, proof_note = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?").run(reference, proofNote ?? null, orderId);
  audit(user.id, "user", "p2p_payment_sent", "p2p_order", orderId, { reference });
  return getP2POrder(orderId);
}

export function releaseP2POrder(user: User, orderId: string) {
  if ((user.kyc_status ?? "unverified") !== "approved") throw new Error("KYC approval is required before releasing P2P escrow");
  const order = getP2POrder(orderId) as Record<string, unknown>;
  if (!order || String(order.seller_id) !== user.id) throw new Error("Only the seller can release escrow");
  if (String(order.status) !== "payment_sent") throw new Error("Only payment-sent orders can be released");
  db.exec("BEGIN");
  try {
    settleP2PRelease(order, user.id, "seller");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getP2POrder(orderId);
}

export function disputeP2POrder(user: User, orderId: string, reason: string) {
  const order = getP2POrder(orderId) as Record<string, unknown>;
  if (!order || ![String(order.buyer_id), String(order.seller_id)].includes(user.id)) throw new Error("Only order participants can dispute");
  if (!["escrow_locked", "payment_sent"].includes(String(order.status))) throw new Error("This order cannot be disputed");
  db.prepare("UPDATE p2p_orders SET status = 'disputed', dispute_reason = ?, disputed_at = CURRENT_TIMESTAMP WHERE id = ?").run(reason.trim() || "Payment confirmation issue", orderId);
  audit(user.id, "user", "p2p_disputed", "p2p_order", orderId, { reason });
  return getP2POrder(orderId);
}

export function cancelP2POrder(user: User, orderId: string) {
  const order = getP2POrder(orderId) as Record<string, unknown>;
  if (!order || ![String(order.buyer_id), String(order.seller_id)].includes(user.id)) throw new Error("Only order participants can cancel");
  if (String(order.status) !== "escrow_locked") throw new Error("Only unpaid escrow orders can be cancelled");
  db.exec("BEGIN");
  try {
    settleP2PRefund(order, user.id, "cancelled", "participant_cancelled", "Order cancelled before payment");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getP2POrder(orderId);
}

export function listP2POrderMessages(user: User, orderId: string) {
  const order = getP2POrder(orderId) as Record<string, unknown>;
  if (!order || ![String(order.buyer_id), String(order.seller_id)].includes(user.id)) throw new Error("Only order participants can view messages");
  return db.prepare(`
    SELECT p2p_messages.*, users.username
    FROM p2p_messages
    JOIN users ON users.id = p2p_messages.user_id
    WHERE order_id = ?
    ORDER BY p2p_messages.created_at ASC
    LIMIT 100
  `).all(orderId);
}

export function addP2POrderMessage(user: User, orderId: string, message: string) {
  const order = getP2POrder(orderId) as Record<string, unknown>;
  if (!order || ![String(order.buyer_id), String(order.seller_id)].includes(user.id)) throw new Error("Only order participants can message");
  if (terminalP2PStatuses.has(String(order.status))) throw new Error("This order is closed");
  const clean = message.trim();
  if (!clean) throw new Error("Message is required");
  if (clean.length > 1000) throw new Error("Message is too long");
  const id = randomUUID();
  db.prepare("INSERT INTO p2p_messages (id, order_id, user_id, message) VALUES (?, ?, ?, ?)").run(id, orderId, user.id, clean);
  audit(user.id, "user", "p2p_message_sent", "p2p_order", orderId);
  return db.prepare(`
    SELECT p2p_messages.*, users.username
    FROM p2p_messages
    JOIN users ON users.id = p2p_messages.user_id
    WHERE p2p_messages.id = ?
  `).get(id);
}

export function listUserP2POrders(userId: string) {
  return db.prepare(`
    SELECT p2p_orders.*, ads.side AS ad_side, buyer.username AS buyer_username, seller.username AS seller_username
    FROM p2p_orders
    JOIN p2p_ads ads ON ads.id = p2p_orders.ad_id
    JOIN users buyer ON buyer.id = p2p_orders.buyer_id
    JOIN users seller ON seller.id = p2p_orders.seller_id
    WHERE buyer_id = ? OR seller_id = ?
    ORDER BY p2p_orders.created_at DESC
    LIMIT 50
  `).all(userId, userId);
}

export function listAdminP2PDisputes() {
  return db.prepare(`
    SELECT p2p_orders.*, ads.side AS ad_side, buyer.username AS buyer_username, buyer.email AS buyer_email,
      seller.username AS seller_username, seller.email AS seller_email
    FROM p2p_orders
    JOIN p2p_ads ads ON ads.id = p2p_orders.ad_id
    JOIN users buyer ON buyer.id = p2p_orders.buyer_id
    JOIN users seller ON seller.id = p2p_orders.seller_id
    WHERE p2p_orders.status = 'disputed'
       OR (p2p_orders.status IN ('escrow_locked', 'payment_sent') AND p2p_orders.expires_at IS NOT NULL AND p2p_orders.expires_at < CURRENT_TIMESTAMP)
    ORDER BY p2p_orders.disputed_at DESC, p2p_orders.created_at ASC
    LIMIT 100
  `).all();
}

export function resolveP2PDispute(adminId: string, orderId: string, resolution: "release_buyer" | "refund_seller" | "no_action", notes = "") {
  const order = getP2POrder(orderId) as Record<string, unknown>;
  if (!order || String(order.status) !== "disputed") throw new Error("Only disputed orders can be resolved");
  db.exec("BEGIN");
  try {
    if (resolution === "release_buyer") {
      settleP2PRelease(order, adminId, "admin", notes);
    } else if (resolution === "refund_seller") {
      settleP2PRefund(order, adminId, "refunded", "admin_refund", notes || "Admin refunded seller");
    } else {
      db.prepare("UPDATE p2p_orders SET status = 'resolved_no_action', resolved_at = CURRENT_TIMESTAMP, resolved_by = ?, resolution = ?, admin_notes = ? WHERE id = ?").run(adminId, resolution, notes, orderId);
      audit(adminId, "admin", "p2p_dispute_no_action", "p2p_order", orderId, { notes });
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getP2POrder(orderId);
}

export function getCryptoBalance(userId: string, assetSymbol: string) {
  return ensureCryptoBalance(userId, assetSymbol);
}

function getP2POrder(id: string) {
  return db.prepare("SELECT * FROM p2p_orders WHERE id = ?").get(id);
}

function formatP2PAd(ad: Record<string, unknown>) {
  const completed = Number(ad.completed_orders ?? 0);
  const total = Number(ad.total_orders ?? 0);
  return {
    ...ad,
    paymentMethods: String(ad.payment_methods ?? defaultPaymentMethods).split(",").map((item) => item.trim()).filter(Boolean),
    completionRate: total > 0 ? money((completed / total) * 100) : 100,
    completedOrders: completed,
    disputeCount: Number(ad.dispute_count ?? 0),
    avgReleaseMinutes: Number(ad.avg_release_minutes ?? 0),
  };
}

function seedP2PPreviewAds(side = "sell", asset = "USDT") {
  const chosenSide = side === "buy" ? "buy" : "sell";
  return [
    { id: "preview-1", username: "SwiftPay KE", side: chosenSide, asset_symbol: asset || "USDT", fiat_currency: "KES", price: 132.45, available_amount: 850, min_limit: 500, max_limit: 75000, paymentMethods: ["M-Pesa", "Bank Transfer", "Paystack"], completionRate: 98.7, completedOrders: 284, disputeCount: 2, avgReleaseMinutes: 4, terms: "Preview only. Release within 5 minutes after payment proof." },
    { id: "preview-2", username: "Nairobi Desk", side: chosenSide, asset_symbol: asset || "USDT", fiat_currency: "KES", price: 131.95, available_amount: 420, min_limit: 1000, max_limit: 50000, paymentMethods: ["Airtel Money", "Cash", "M-Pesa"], completionRate: 97.2, completedOrders: 141, disputeCount: 1, avgReleaseMinutes: 7, terms: "Preview only. Use exact reference shown in order chat." },
    { id: "preview-3", username: "Pro Merchant", side: chosenSide, asset_symbol: asset || "USDT", fiat_currency: "KES", price: 133.1, available_amount: 1260, min_limit: 2500, max_limit: 150000, paymentMethods: ["Bank Transfer", "Paystack"], completionRate: 99.1, completedOrders: 520, disputeCount: 3, avgReleaseMinutes: 3, terms: "Preview only. Admin escrow dispute available." },
  ];
}

function parsePaymentMethods(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function ensureCryptoBalance(userId: string, assetSymbol: string) {
  const normalized = assetSymbol.toUpperCase();
  db.prepare("INSERT OR IGNORE INTO crypto_balances (user_id, asset_symbol, account_type, available, locked) VALUES (?, ?, 'spot', 0, 0)").run(userId, normalized);
  return db.prepare("SELECT * FROM crypto_balances WHERE user_id = ? AND asset_symbol = ? AND account_type = 'spot'").get(userId, normalized) as { available: number; locked: number; asset_symbol: string; user_id: string; account_type: string };
}

function writeLedger(userId: string, assetSymbol: string, amount: number, balanceAfter: number, lockedAfter: number, type: string, referenceId: string, description: string) {
  db.prepare(`
    INSERT INTO ledger_entries (id, user_id, asset_symbol, account_type, amount, balance_after, locked_after, type, reference_id, description)
    VALUES (?, ?, ?, 'spot', ?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), userId, assetSymbol, amount, balanceAfter, lockedAfter, type, referenceId, description);
}

function lockCrypto(userId: string, assetSymbol: string, amount: number, referenceId: string, type: string, description: string) {
  const balance = ensureCryptoBalance(userId, assetSymbol);
  const safeAmount = money(amount);
  if (safeAmount <= 0) throw new Error("Crypto lock amount must be greater than zero");
  if (Number(balance.available) < safeAmount) throw new Error(`Insufficient ${assetSymbol} available balance`);
  const nextAvailable = money(Number(balance.available) - safeAmount);
  const nextLocked = money(Number(balance.locked) + safeAmount);
  db.prepare("UPDATE crypto_balances SET available = ?, locked = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND asset_symbol = ? AND account_type = 'spot'").run(nextAvailable, nextLocked, userId, assetSymbol);
  writeLedger(userId, assetSymbol, -safeAmount, nextAvailable, nextLocked, type, referenceId, description);
}

function unlockCrypto(userId: string, assetSymbol: string, amount: number, referenceId: string, type: string, description: string) {
  const balance = ensureCryptoBalance(userId, assetSymbol);
  const safeAmount = money(amount);
  if (Number(balance.locked) < safeAmount) throw new Error(`Insufficient ${assetSymbol} locked balance`);
  const nextAvailable = money(Number(balance.available) + safeAmount);
  const nextLocked = money(Number(balance.locked) - safeAmount);
  db.prepare("UPDATE crypto_balances SET available = ?, locked = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND asset_symbol = ? AND account_type = 'spot'").run(nextAvailable, nextLocked, userId, assetSymbol);
  writeLedger(userId, assetSymbol, safeAmount, nextAvailable, nextLocked, type, referenceId, description);
}

function transferLockedCryptoToBuyer(sellerId: string, buyerId: string, assetSymbol: string, amount: number, referenceId: string) {
  const seller = ensureCryptoBalance(sellerId, assetSymbol);
  const safeAmount = money(amount);
  if (Number(seller.locked) < safeAmount) throw new Error(`Insufficient ${assetSymbol} locked balance`);
  const sellerLocked = money(Number(seller.locked) - safeAmount);
  db.prepare("UPDATE crypto_balances SET locked = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND asset_symbol = ? AND account_type = 'spot'").run(sellerLocked, sellerId, assetSymbol);
  writeLedger(sellerId, assetSymbol, -safeAmount, Number(seller.available), sellerLocked, "p2p_escrow_release", referenceId, `Released ${safeAmount} ${assetSymbol} from P2P escrow`);

  const buyer = ensureCryptoBalance(buyerId, assetSymbol);
  const buyerAvailable = money(Number(buyer.available) + safeAmount);
  db.prepare("UPDATE crypto_balances SET available = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND asset_symbol = ? AND account_type = 'spot'").run(buyerAvailable, buyerId, assetSymbol);
  writeLedger(buyerId, assetSymbol, safeAmount, buyerAvailable, Number(buyer.locked), "p2p_escrow_credit", referenceId, `Received ${safeAmount} ${assetSymbol} from P2P escrow`);
}

function settleP2PRelease(order: Record<string, unknown>, actorId: string, actorType: "seller" | "admin", notes = "") {
  const orderId = String(order.id);
  transferLockedCryptoToBuyer(String(order.seller_id), String(order.buyer_id), String(order.asset_symbol), Number(order.asset_amount), orderId);
  db.prepare("UPDATE p2p_orders SET status = 'released', released_at = CURRENT_TIMESTAMP, resolved_at = CASE WHEN ? = 'admin' THEN CURRENT_TIMESTAMP ELSE resolved_at END, resolved_by = CASE WHEN ? = 'admin' THEN ? ELSE resolved_by END, resolution = CASE WHEN ? = 'admin' THEN 'release_buyer' ELSE resolution END, admin_notes = CASE WHEN ? = 'admin' THEN ? ELSE admin_notes END WHERE id = ?")
    .run(actorType, actorType, actorId, actorType, actorType, notes, orderId);
  audit(actorId, actorType, actorType === "admin" ? "p2p_dispute_release_buyer" : "p2p_released", "p2p_order", orderId, notes ? { notes } : undefined);
}

function settleP2PRefund(order: Record<string, unknown>, actorId: string, status: "cancelled" | "refunded" | "expired", resolution: string, notes: string) {
  const orderId = String(order.id);
  const ad = db.prepare("SELECT side FROM p2p_ads WHERE id = ?").get(String(order.ad_id)) as { side?: string } | undefined;
  const shouldRestoreAd = status === "cancelled";
  const shouldUnlockSeller = status !== "cancelled" || String(ad?.side) === "buy";
  if (shouldUnlockSeller) {
    unlockCrypto(String(order.seller_id), String(order.asset_symbol), Number(order.asset_amount), orderId, status === "cancelled" ? "p2p_order_cancel_unlock" : "p2p_escrow_refund", notes);
  }
  if (shouldRestoreAd) {
    db.prepare("UPDATE p2p_ads SET available_amount = available_amount + ?, status = CASE WHEN status = 'filled' THEN 'active' ELSE status END WHERE id = ?").run(Number(order.asset_amount), String(order.ad_id));
  }
  db.prepare(`
    UPDATE p2p_orders
    SET status = ?, cancelled_at = CASE WHEN ? = 'cancelled' THEN CURRENT_TIMESTAMP ELSE cancelled_at END,
      resolved_at = CASE WHEN ? <> 'cancelled' THEN CURRENT_TIMESTAMP ELSE resolved_at END,
      resolved_by = CASE WHEN ? <> 'cancelled' THEN ? ELSE resolved_by END,
      resolution = ?, admin_notes = CASE WHEN ? <> 'cancelled' THEN ? ELSE admin_notes END
    WHERE id = ?
  `).run(status, status, status, status, actorId, resolution, status, notes, orderId);
  audit(actorId, status === "cancelled" ? "user" : "admin", status === "cancelled" ? "p2p_cancelled" : "p2p_dispute_refund_seller", "p2p_order", orderId, { notes });
}

function audit(actorId: string | null, actorType: string, action: string, entityType: string, entityId?: string, metadata?: unknown) {
  db.prepare("INSERT INTO audit_logs (id, actor_id, actor_type, action, entity_type, entity_id, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)").run(randomUUID(), actorId, actorType, action, entityType, entityId ?? null, metadata ? JSON.stringify(metadata) : null);
}

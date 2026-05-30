import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { getFreshUser, createManualTrade, getAutoSession, maybeCreateAutoTrade, recordAutoSettlement, settleOpenPositions, startAutoSession, stopAutoSession, updateAutoSessionSettings } from "./repositories";
import { market } from "./market";
import { publicUser, verifyToken } from "./db";

type ClientState = {
  userId?: string;
  asset: string;
};

export function attachWebSocketServer(server: { on: (event: "upgrade", cb: (req: IncomingMessage, socket: unknown, head: Buffer) => void) => void }) {
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Map<WebSocket, ClientState>();

  market.start();
  market.subscribe((tick) => {
    for (const [socket, state] of clients) {
      if (socket.readyState === socket.OPEN && state.asset === tick.asset) {
        socket.send(JSON.stringify({ type: "price_update", data: tick }));
        if (state.userId) {
          try {
            const closedOrProgress = settleOpenPositions(state.userId, tick.asset, tick);
            closedOrProgress.forEach((position) => socket.send(JSON.stringify({ type: "position_update", data: position })));
            const autoSession = recordAutoSettlement(state.userId, closedOrProgress);
            if (autoSession) socket.send(JSON.stringify({ type: "auto_trading_update", data: autoSession }));
            const autoPosition = maybeCreateAutoTrade(state.userId, tick);
            if (autoPosition) socket.send(JSON.stringify({ type: "position_update", data: autoPosition }));
            if (closedOrProgress.length || autoPosition) {
              socket.send(JSON.stringify({ type: "balance_update", data: publicUser(getFreshUser(state.userId)) }));
            }
          } catch (error) {
            socket.send(JSON.stringify({ type: "error", data: error instanceof Error ? error.message : "Trade processing failed" }));
          }
        }
      }
    }
  });

  wss.on("connection", (socket) => {
    clients.set(socket, { asset: "volatility_10_1s" });
    socket.send(JSON.stringify({ type: "price_update", data: market.current("volatility_10_1s") }));

    socket.on("message", (raw) => {
      try {
        const message = JSON.parse(raw.toString()) as { type?: string; token?: string; asset?: string; config?: Record<string, unknown> };
        const state = clients.get(socket) ?? { asset: "volatility_10_1s" };

        if (message.type === "auth") {
          const payload = verifyToken<{ id: string; kind: string }>(message.token);
          if (!payload?.id || payload.kind !== "user") {
            socket.send(JSON.stringify({ type: "auth_error", data: "Invalid token" }));
            return;
          }
          state.userId = payload.id;
          clients.set(socket, state);
          socket.send(JSON.stringify({ type: "auth_success", data: { user: publicUser(getFreshUser(payload.id)), autoTrading: getAutoSession(payload.id) } }));
          return;
        }

        if (message.type === "subscribe" && message.asset) {
          state.asset = message.asset;
          clients.set(socket, state);
          socket.send(JSON.stringify({ type: "price_update", data: market.current(message.asset) }));
          return;
        }

        if (!state.userId) {
          socket.send(JSON.stringify({ type: "auth_error", data: "Authenticate first" }));
          return;
        }

        const user = getFreshUser(state.userId);

        if (message.type === "manual_trade" && message.config) {
          const asset = String(message.config.asset ?? state.asset);
          const position = createManualTrade(user, {
            asset,
            direction: String(message.config.direction ?? "over") as never,
            stake: Number(message.config.stake ?? 0),
            selectedDigit: Number(message.config.selectedDigit ?? 5),
            isDemo: Boolean(message.config.isDemo),
            durationTicks: Number(message.config.durationTicks ?? 5),
            contractMode: message.config.contractMode === "forex" ? "forex" : "digit",
            leverage: Number(message.config.leverage ?? 1),
          }, market.current(asset));
          socket.send(JSON.stringify({ type: "position_update", data: position }));
          socket.send(JSON.stringify({ type: "balance_update", data: publicUser(getFreshUser(state.userId)) }));
          return;
        }

        if (message.type === "auto_trading_start" && message.config) {
          const session = startAutoSession(user, {
            asset: String(message.config.asset ?? state.asset),
            direction: String(message.config.direction ?? "over") as never,
            stake: Number(message.config.stake ?? 0),
            targetProfit: Number(message.config.targetProfit ?? 0),
            targetLoss: Number(message.config.targetLoss ?? 0),
            lossMultiple: Number(message.config.lossMultiple ?? 1),
            isDemo: Boolean(message.config.isDemo),
            selectedDigit: Number(message.config.selectedDigit ?? 5),
            strategy: String(message.config.strategy ?? "smart"),
            maxTrades: Number(message.config.maxTrades ?? 25),
            durationTicks: Number(message.config.durationTicks ?? 5),
            contractMode: message.config.contractMode === "forex" ? "forex" : "digit",
            leverage: Number(message.config.leverage ?? 1),
          });
          socket.send(JSON.stringify({ type: "auto_trading_response", session }));
          const autoPosition = maybeCreateAutoTrade(state.userId, market.current(String(message.config.asset ?? state.asset)));
          if (autoPosition) {
            socket.send(JSON.stringify({ type: "position_update", data: autoPosition }));
            socket.send(JSON.stringify({ type: "balance_update", data: publicUser(getFreshUser(state.userId)) }));
          }
          return;
        }

        if (message.type === "auto_trading_stop") {
          socket.send(JSON.stringify({ type: "auto_trading_update", data: stopAutoSession(state.userId) }));
          return;
        }

        if (message.type === "auto_trading_status") {
          socket.send(JSON.stringify({ type: "auto_trading_response", session: getAutoSession(state.userId) }));
          return;
        }

        if (message.type === "auto_trading_update_settings") {
          socket.send(JSON.stringify({
            type: "auto_trading_update",
            data: updateAutoSessionSettings(state.userId, { durationTicks: Number(message.config?.durationTicks ?? 5) }),
          }));
          return;
        }
      } catch (error) {
        socket.send(JSON.stringify({ type: "error", data: error instanceof Error ? error.message : "Invalid message" }));
      }
    });

    socket.on("close", () => clients.delete(socket));
  });

  server.on("upgrade", (request, socket, head) => {
    if (!request.url?.startsWith("/ws")) return;
    wss.handleUpgrade(request, socket as never, head, (ws) => wss.emit("connection", ws, request));
  });
}

import { state } from './state.js';

export function addClient(client) {
  state.sseClients.add(client);
  return () => state.sseClients.delete(client);
}

export function broadcast(event, data) {
  const payload = JSON.stringify(data ?? {});
  const chunk = `event: ${event}\ndata: ${payload}\n\n`;
  for (const client of state.sseClients) {
    try {
      client.write(chunk);
    } catch {
      state.sseClients.delete(client);
    }
  }
}

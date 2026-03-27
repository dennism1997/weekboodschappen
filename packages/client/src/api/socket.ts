import { io } from "socket.io-client";

// Connect to the same origin; Vite proxy forwards /socket.io to the server.
// Cookies are sent automatically (withCredentials: true).
export const socket = io("/", {
  withCredentials: true,
  autoConnect: false,
});

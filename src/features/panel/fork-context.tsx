import { createContext, useContext } from "react";

/**
 * Callback to fork the current session from a specific message.
 * `messageId` is the DB id of the message to fork after (inclusive).
 */
type ForkMessageFn = (messageId: string) => void;

const ForkContext = createContext<ForkMessageFn | null>(null);

export const ForkProvider = ForkContext.Provider;

/**
 * Returns the fork callback, or `null` when no fork handler is available
 * (e.g. in tests or outside a session panel).
 */
export function useForkMessage(): ForkMessageFn | null {
	return useContext(ForkContext);
}

use std::sync::Mutex;

use tauri::ipc::Channel;
use tokio::sync::mpsc;

use super::events::UiMutationEvent;

#[derive(Default)]
pub struct UiSyncManager {
    subscribers: Mutex<Vec<UiSyncSubscriber>>,
    sse_subscribers: Mutex<Vec<UiSyncSseSubscriber>>,
}

struct UiSyncSubscriber {
    id: String,
    channel: Channel<UiMutationEvent>,
}

struct UiSyncSseSubscriber {
    id: String,
    sender: mpsc::UnboundedSender<UiMutationEvent>,
}

impl UiSyncManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn subscribe(&self, id: String, channel: Channel<UiMutationEvent>) {
        if let Ok(mut subscribers) = self.subscribers.lock() {
            subscribers.retain(|subscriber| subscriber.id != id);
            subscribers.push(UiSyncSubscriber { id, channel });
        }
    }

    pub fn unsubscribe(&self, id: &str) {
        if let Ok(mut subscribers) = self.subscribers.lock() {
            subscribers.retain(|subscriber| subscriber.id != id);
        }
    }

    pub fn subscribe_sse(&self, id: String) -> mpsc::UnboundedReceiver<UiMutationEvent> {
        let (sender, receiver) = mpsc::unbounded_channel();
        if let Ok(mut subscribers) = self.sse_subscribers.lock() {
            subscribers.retain(|subscriber| subscriber.id != id);
            subscribers.push(UiSyncSseSubscriber { id, sender });
        }
        receiver
    }

    pub fn unsubscribe_sse(&self, id: &str) {
        if let Ok(mut subscribers) = self.sse_subscribers.lock() {
            subscribers.retain(|subscriber| subscriber.id != id);
        }
    }

    pub fn publish(&self, event: UiMutationEvent) {
        let Ok(mut subscribers) = self.subscribers.lock() else {
            return;
        };

        subscribers.retain(|subscriber| subscriber.channel.send(event.clone()).is_ok());
        if let Ok(mut subscribers) = self.sse_subscribers.lock() {
            subscribers.retain(|subscriber| subscriber.sender.send(event.clone()).is_ok());
        }
    }

    #[cfg(test)]
    pub(super) fn subscriber_count(&self) -> usize {
        self.subscribers.lock().map(|s| s.len()).unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_manager_starts_with_no_subscribers() {
        let manager = UiSyncManager::new();
        assert_eq!(manager.subscriber_count(), 0);
    }

    #[test]
    fn publish_with_no_subscribers_is_a_noop() {
        let manager = UiSyncManager::new();
        manager.publish(UiMutationEvent::WorkspaceListChanged);
        assert_eq!(manager.subscriber_count(), 0);
    }

    #[test]
    fn publish_sends_to_sse_subscribers() {
        let manager = UiSyncManager::new();
        let mut receiver = manager.subscribe_sse("mobile".to_string());
        manager.publish(UiMutationEvent::WorkspaceListChanged);
        assert_eq!(
            receiver.try_recv().expect("event should be published"),
            UiMutationEvent::WorkspaceListChanged
        );
    }

    #[test]
    fn unsubscribe_missing_subscriber_is_a_noop() {
        let manager = UiSyncManager::new();
        manager.unsubscribe("missing");
        assert_eq!(manager.subscriber_count(), 0);
    }

    #[test]
    fn default_manager_matches_new() {
        let default_manager = UiSyncManager::default();
        let new_manager = UiSyncManager::new();
        assert_eq!(
            default_manager.subscriber_count(),
            new_manager.subscriber_count()
        );
    }
}

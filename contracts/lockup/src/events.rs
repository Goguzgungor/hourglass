use hourglass_shared::Stream;
use soroban_sdk::{symbol_short, Address, Env, Symbol};

pub(crate) fn stream_created(env: &Env, id: u32, s: &Stream) {
    let topic_domain = Symbol::new(env, "stream");
    let topic_action = symbol_short!("created");
    env.events().publish(
        (topic_domain, topic_action, id, s.sender.clone()),
        (s.recipient.clone(), s.token.clone(), s.deposited),
    );
}

pub(crate) fn withdrawn(env: &Env, id: u32, to: &Address, amount: i128, caller: &Address) {
    let topic_domain = Symbol::new(env, "stream");
    let topic_action = Symbol::new(env, "withdrawn");
    env.events().publish(
        (topic_domain, topic_action, id, to.clone()),
        (amount, caller.clone()),
    );
}

pub(crate) fn canceled(env: &Env, id: u32, sender_refund: i128, recipient_balance: i128) {
    let topic_domain = Symbol::new(env, "stream");
    let topic_action = Symbol::new(env, "canceled");
    env.events()
        .publish((topic_domain, topic_action, id), (sender_refund, recipient_balance));
}

pub(crate) fn renounced(env: &Env, id: u32) {
    let topic_domain = Symbol::new(env, "stream");
    let topic_action = Symbol::new(env, "renounced");
    env.events().publish((topic_domain, topic_action, id), ());
}

pub(crate) fn burned(env: &Env, id: u32) {
    let topic_domain = Symbol::new(env, "stream");
    let topic_action = Symbol::new(env, "burned");
    env.events().publish((topic_domain, topic_action, id), ());
}

pub(crate) fn transferred(env: &Env, id: u32, from: &Address, new_owner: &Address) {
    let topic_domain = Symbol::new(env, "stream");
    let topic_action = Symbol::new(env, "transferred");
    env.events().publish(
        (topic_domain, topic_action, id, new_owner.clone()),
        from.clone(),
    );
}

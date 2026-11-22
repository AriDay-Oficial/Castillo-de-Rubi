import { createEventBus } from "./core/events.js";
import { createStorage } from "./core/storage.js";
import { createApp } from "./ui/app.js";

const bus = createEventBus();
const storage = createStorage();

createApp({ doc: document, bus, storage });

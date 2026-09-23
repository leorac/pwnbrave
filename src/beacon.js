import { partitionId } from "./partition.js";

chrome.runtime.sendMessage({ kind: "partition", id: partitionId() });

import { partitionId } from "./partition.js";

chrome.runtime.sendMessage({ kind: "defaultPartition", id: partitionId() });

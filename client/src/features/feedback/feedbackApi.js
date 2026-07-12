// Keeps the Feedback widget isolated from direct HTTP calls.

import { get, post } from "../../api.js";

export const feedbackApi = {
  status: () => get("/feedback/status"),
  submit: (report, image) => {
    const body = new FormData();
    Object.entries(report).forEach(([key, value]) => body.append(key, value));
    if (image) body.append("image", image);
    return post("/feedback", body, false);
  },
};

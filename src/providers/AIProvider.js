export class AIProvider {
  constructor({ name, model }) {
    this.name = name;
    this.model = model;
  }

  validateOutputs() {}

  async generateImages() {
    throw new Error("AIProvider.generateImages() must be implemented by a provider.");
  }
}

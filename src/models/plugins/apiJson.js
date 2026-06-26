function apiJsonPlugin(schema) {
  schema.set('toJSON', {
    versionKey: false,
    transform: (_, ret) => {
      delete ret._id;
      return ret;
    }
  });
  schema.set('toObject', {
    versionKey: false,
    transform: (_, ret) => {
      delete ret._id;
      return ret;
    }
  });
}

module.exports = apiJsonPlugin;

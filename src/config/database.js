const mongoose = require('mongoose');

function attendre(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function connectDB(maxRetries = 15, delayMs = 2000) {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI est requis dans les variables d\'environnement.');
  }

  mongoose.set('strictQuery', true);

  for (let tentative = 1; tentative <= maxRetries; tentative += 1) {
    try {
      await mongoose.connect(uri);
      console.log('MongoDB connecté.');
      return;
    } catch (err) {
      if (tentative === maxRetries) throw err;
      console.log(`MongoDB indisponible (${tentative}/${maxRetries}), nouvelle tentative dans ${delayMs / 1000}s…`);
      await attendre(delayMs);
    }
  }
}

module.exports = { connectDB, mongoose };

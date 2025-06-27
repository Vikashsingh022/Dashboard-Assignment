const mongoose = require('mongoose');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// User schema/model (same as in index.js)
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});
const User = mongoose.model('User', userSchema);

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/hrms', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', async () => {
  try {
    const users = JSON.parse(fs.readFileSync('hrms.users.json', 'utf-8'));
    // Hash passwords if not already hashed
    for (let user of users) {
      if (!user.password.startsWith('$2')) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    }
    await User.deleteMany({}); // Optional: clear existing users
    await User.insertMany(users);
    console.log('Users imported!');
  } catch (err) {
    console.error('Import error:', err);
  } finally {
    mongoose.disconnect();
  }
}); 
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';
const SESSION_DURATION = 2 * 60 * 60; // 2 hours in seconds

app.use(cors());
app.use(express.json());

// Connect to MongoDB Atlas or fallback to localhost
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';
mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => console.log('Connected to MongoDB'));

// User schema/model
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});
const User = mongoose.model('User', userSchema);

// LoginAttempt schema/model
const loginAttemptSchema = new mongoose.Schema({
  email: String,
  password: String, // For security, remove in production!
  timestamp: { type: Date, default: Date.now }
});
const LoginAttempt = mongoose.model('LoginAttempt', loginAttemptSchema);

// Candidate schema/model
const candidateSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  position: String,
  status: String,
  experience: String,
  resume: String, // filename or URL
});
const Candidate = mongoose.model('Candidate', candidateSchema);

// Employee schema/model
const employeeSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  position: String,
  status: String,
  experience: String,
  resume: String,
});
const Employee = mongoose.model('Employee', employeeSchema);

// Attendance schema/model
const attendanceSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  date: Date,
  status: String, // e.g., 'Present', 'Absent', etc.
});
const Attendance = mongoose.model('Attendance', attendanceSchema);

// Leave schema/model
const leaveSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  from: Date,
  to: Date,
  type: String, // e.g., 'Sick', 'Casual', etc.
  status: String, // e.g., 'Approved', 'Pending', etc.
  reason: String,
});
const Leave = mongoose.model('Leave', leaveSchema);

// Multer setup for file uploads
const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Register endpoint
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'All fields are required' });
  }
  try {
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'Email already registered' });
    }
    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashed });
    await user.save();
    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: SESSION_DURATION });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  // Log the attempt
  await LoginAttempt.create({ email, password });
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: SESSION_DURATION });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Middleware to protect routes
function authMiddleware(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth) return res.status(401).json({ message: 'No token provided' });
  const token = auth.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ message: 'Invalid token' });
    req.user = decoded;
    next();
  });
}

// Example protected route
app.get('/api/protected', authMiddleware, (req, res) => {
  res.json({ message: 'This is protected data', user: req.user });
});

// Get all candidates
app.get('/api/candidates', async (req, res) => {
  const candidates = await Candidate.find();
  res.json(candidates);
});

// Get all employees
app.get('/api/employees', async (req, res) => {
  const employees = await Employee.find();
  res.json(employees);
});

// Add a new candidate (and always add to employees)
app.post('/api/candidates', async (req, res) => {
  const { name, email, phone, position, status, experience, resume } = req.body;
  const candidate = new Candidate({ name, email, phone, position, status, experience, resume });
  await candidate.save();
  // Always add to employees (if not already present)
  const exists = await Employee.findOne({ email });
  if (!exists) {
    const employee = new Employee({ name, email, phone, position, status, experience, resume });
    await employee.save();
  }
  res.json(candidate);
});

// Delete a candidate by id
app.delete('/api/candidates/:id', async (req, res) => {
  await Candidate.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// Update a candidate by id (PATCH)
app.patch('/api/candidates/:id', async (req, res) => {
  const update = req.body;
  const candidate = await Candidate.findByIdAndUpdate(req.params.id, update, { new: true });
  // If status is updated to Selected, add to employees
  if (update.status === 'Selected') {
    const exists = await Employee.findOne({ email: candidate.email });
    if (!exists) {
      const employee = new Employee({
        name: candidate.name,
        email: candidate.email,
        phone: candidate.phone,
        position: candidate.position,
        status: candidate.status,
        experience: candidate.experience,
        resume: candidate.resume,
      });
      await employee.save();
    }
  }
  res.json(candidate);
});

// Upload candidate resume
app.post('/api/candidates/:id/upload-resume', upload.single('resume'), async (req, res) => {
  const candidate = await Candidate.findByIdAndUpdate(
    req.params.id,
    { resume: req.file.filename },
    { new: true }
  );
  res.json(candidate);
});

// Download candidate resume
app.get('/api/candidates/:id/download-resume', async (req, res) => {
  const candidate = await Candidate.findById(req.params.id);
  if (!candidate || !candidate.resume) return res.status(404).send('Resume not found');
  res.download(path.join(__dirname, 'uploads', candidate.resume));
});

// Get all attendance records
app.get('/api/attendance', async (req, res) => {
  const records = await Attendance.find();
  res.json(records);
});

// Add an attendance record
app.post('/api/attendance', async (req, res) => {
  const record = new Attendance(req.body);
  await record.save();
  res.json(record);
});

// Get all leave records
app.get('/api/leaves', async (req, res) => {
  const records = await Leave.find();
  res.json(records);
});

// Add a leave record
app.post('/api/leaves', async (req, res) => {
  const record = new Leave(req.body);
  await record.save();
  res.json(record);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 
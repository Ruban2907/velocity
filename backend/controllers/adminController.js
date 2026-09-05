const User = require("../model/user");
const Activity = require("../model/activity");
const { logActivity } = require("../utils/activityLogger");
const { hashPassword } = require("../utils/password");

/**
 * CREATE NEW USER
 * @route POST /api/admin/users
 */
const createRecruiter = async (req, res) => {
  try {
    const { firstname, lastname, companyname, email, password } = req.body;

    if (!firstname || !email || !password) {
      return res.status(400).json({ success: false, message: "Firstname, email and password are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ success: false, message: "User already exists" });
    }

    const hashedPassword = await hashPassword(password);
    const user = await User.create({
      firstname,
      lastname,
      companyname,
      email,
      password: hashedPassword,
      role: 'user'
    });

    await logActivity({
      userId: req.user._id,
      feature: 'admin',
      action: 'CREATE_USER',
      metadata: { targetUserId: user._id, targetUserEmail: user.email }
    });

    const userObject = user.toObject();
    delete userObject.password;

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: userObject
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating recruiter",
      error: error.message
    });
  }
};

/**
 * DELETE ACTIVITIES (BULK)
 * @route DELETE /api/admin/activities
 */
const deleteActivities = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ success: false, message: "IDs array is required" });
    }

    await Activity.deleteMany({ _id: { $in: ids } });

    await logActivity({
      userId: req.user._id,
      feature: 'admin',
      action: 'DELETE_ACTIVITIES',
      metadata: { count: ids.length }
    });

    res.status(200).json({ success: true, message: `${ids.length} activities deleted` });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete activities" });
  }
};

/**
 * PURGE ALL ACTIVITIES
 * @route DELETE /api/admin/activities/purge
 */
const purgeActivities = async (req, res) => {
  try {
    await Activity.deleteMany({});
    
    await logActivity({
      userId: req.user._id,
      feature: 'admin',
      action: 'PURGE_ACTIVITIES'
    });

    res.status(200).json({ success: true, message: "All activity logs cleared" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to purge activities" });
  }
};

/**
 * GET ALL NON-ADMIN USERS
 * @route GET /api/admin/users
 */
const getAllRecruiters = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 100), 200);
    const skip = (page - 1) * limit;

    let query = User.find({ _id: { $ne: req.user._id } })
      .select('-password')
      .sort({ createdAt: -1 });

    if (query && typeof query.skip === 'function') {
      query = query.skip(skip);
    }
    if (query && typeof query.limit === 'function') {
      query = query.limit(limit);
    }

    const users = await query;

    res.status(200).json({
      success: true,
      data: users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching recruiters",
      error: error.message
    });
  }
};

/**
 * GET ONE USER
 * @route GET /api/admin/users/:id
 */
const getRecruiterById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching recruiter details",
      error: error.message
    });
  }
};

/**
 * UPDATE USER
 * @route PATCH /api/admin/users/:id
 */
const updateRecruiter = async (req, res) => {
  try {
    const { firstname, lastname, email, companyname } = req.body;
    
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (firstname) user.firstname = firstname;
    if (lastname) user.lastname = lastname;
    if (email) user.email = email;
    if (companyname) user.companyname = companyname;

    await user.save();
    
    // Manual audit log
    await logActivity({
      userId: req.user._id,
      feature: 'admin',
      action: 'UPDATE_USER',
      metadata: { targetUserId: req.params.id, updatedFields: Object.keys(req.body) }
    });

    const updatedUser = user.toObject();
    delete updatedUser.password;

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: updatedUser
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating recruiter",
      error: error.message
    });
  }
};

/**
 * DELETE USER
 * @route DELETE /api/admin/users/:id
 */
const deleteRecruiter = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Manual audit log
    await logActivity({
      userId: req.user._id,
      feature: 'admin',
      action: 'DELETE_USER',
      metadata: { targetUserId: req.params.id, targetUserEmail: user.email }
    });

    res.status(200).json({
      success: true,
      message: "User deleted successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting recruiter",
      error: error.message
    });
  }
};

/**
 * RESET PASSWORD
 * @route PATCH /api/admin/users/:id/reset-password
 */
const resetUserPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "Valid new password (min 6 chars) required" });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const hashedPassword = await hashPassword(newPassword);
    user.password = hashedPassword;
    await user.save();

    // Manual audit log
    await logActivity({
      userId: req.user._id,
      feature: 'admin',
      action: 'RESET_PASSWORD',
      metadata: { targetUserId: req.params.id }
    });

    res.status(200).json({
      success: true,
      message: "Password reset successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error resetting password",
      error: error.message
    });
  }
};

/**
 * GET ACTIVITY LOGS
 * @route GET /api/admin/activity
 */
const getActivityLogs = async (req, res) => {
  try {
    const { userId, feature, action, startDate, endDate, limit = 50, skip = 0 } = req.query;
    
    // Build filter
    const filter = {};
    if (userId) filter.userId = userId;
    if (feature) filter.feature = feature;
    if (action) filter.action = action;
    
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 50), 100);
    const safeSkip = Math.max(0, parseInt(skip, 10) || 0);

    const logs = await Activity.find(filter)
      .populate('userId', 'firstname lastname email')
      .sort({ createdAt: -1 })
      .skip(safeSkip)
      .limit(safeLimit);

    const total = await Activity.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        total,
        limit: safeLimit,
        skip: safeSkip
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching activity logs",
      error: error.message
    });
  }
};

module.exports = {
  getAllRecruiters,
  getRecruiterById,
  createRecruiter,
  updateRecruiter,
  deleteRecruiter,
  resetUserPassword,
  getActivityLogs,
  deleteActivities,
  purgeActivities
};

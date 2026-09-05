const { generateToken } = require('../utils/jwt');

const mockUser = {
  _id: '65f1a2b3c4d5e6f7a8b9c0d1',
  firstname: 'Jane',
  lastname: 'Recruiter',
  email: 'jane.recruiter@example.com',
  role: 'user',
  companyname: 'Acme Talent',
  toObject: function() { return { ...this }; }
};

const mockRecruiter2 = {
  _id: '65f1a2b3c4d5e6f7a8b9c0d2',
  firstname: 'Bob',
  lastname: 'Recruiter',
  email: 'bob.recruiter@example.com',
  role: 'user',
  companyname: 'Beta Talent',
  toObject: function() { return { ...this }; }
};

const mockAdmin = {
  _id: '65f1a2b3c4d5e6f7a8b9c0d3',
  firstname: 'Admin',
  lastname: 'User',
  email: 'admin@example.com',
  role: 'admin',
  companyname: 'Velocity Admin',
  toObject: function() { return { ...this }; }
};

function createAuthHeader(user = mockUser) {
  const token = generateToken({
    userId: user._id.toString(),
    email: user.email,
    role: user.role
  });
  return `Bearer ${token}`;
}

const User = require('../model/user');

function mockAuthUser(user = mockUser) {
  return jest.spyOn(User, 'findById').mockImplementation((id) => {
    const p = Promise.resolve(user);
    p.select = jest.fn().mockResolvedValue(user);
    return p;
  });
}


module.exports = {
  mockUser,
  mockRecruiter2,
  mockAdmin,
  createAuthHeader,
  mockAuthUser,
};


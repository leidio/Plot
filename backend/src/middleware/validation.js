const { body, validationResult } = require('express-validator');

// Email validation
const emailValidator = body('email')
  .isEmail()
  .withMessage('Please provide a valid email address')
  .normalizeEmail();

// Password validation - minimum 8 characters, at least one letter and one number
const passwordValidator = body('password')
  .isLength({ min: 8 })
  .withMessage('Password must be at least 8 characters long')
  .matches(/^(?=.*[A-Za-z])(?=.*\d)/)
  .withMessage('Password must contain at least one letter and one number');

// Name validation
const firstNameValidator = body('firstName')
  .trim()
  .isLength({ min: 1, max: 50 })
  .withMessage('First name must be between 1 and 50 characters')
  .matches(/^[a-zA-Z\s'-]+$/)
  .withMessage('First name can only contain letters, spaces, hyphens, and apostrophes');

const lastNameValidator = body('lastName')
  .trim()
  .isLength({ min: 1, max: 50 })
  .withMessage('Last name must be between 1 and 50 characters')
  .matches(/^[a-zA-Z\s'-]+$/)
  .withMessage('Last name can only contain letters, spaces, hyphens, and apostrophes');

// Validation result handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: {
        message: errors.array()[0].msg,
        details: errors.array()
      }
    });
  }
  next();
};

// Validation chains
const validateRegister = [
  emailValidator,
  passwordValidator,
  firstNameValidator,
  lastNameValidator,
  body('location').optional().trim().isLength({ max: 100 }).withMessage('Location must be less than 100 characters'),
  handleValidationErrors
];

const validateLogin = [
  emailValidator,
  body('password').notEmpty().withMessage('Password is required'),
  handleValidationErrors
];

const validatePasswordUpdate = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  passwordValidator,
  handleValidationErrors
];

const validateEmailUpdate = [
  emailValidator,
  handleValidationErrors
];

module.exports = {
  validateRegister,
  validateLogin,
  validatePasswordUpdate,
  validateEmailUpdate,
  handleValidationErrors
};


CREATE DATABASE IF NOT EXISTS tourism_arrivals
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE tourism_arrivals;

CREATE TABLE IF NOT EXISTS accommodations (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  municipality VARCHAR(255),
  address VARCHAR(500),
  contact_person VARCHAR(255),
  contact_number VARCHAR(50),
  permit_number VARCHAR(100),
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  fully_booked TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(32) PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(255) NULL,
  email_verified_at DATETIME NULL,
  password_hash VARCHAR(255) NOT NULL,
  auth_version INT NOT NULL DEFAULT 0,
  role ENUM('staff','admin','superadmin') NOT NULL,
  name VARCHAR(255),
  accommodation_id VARCHAR(32) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_users_email (email),
  CONSTRAINT fk_users_accommodation FOREIGN KEY (accommodation_id)
    REFERENCES accommodations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(32) PRIMARY KEY,
  user_id VARCHAR(32) NOT NULL,
  type VARCHAR(40) NOT NULL DEFAULT 'info',
  title VARCHAR(255) NOT NULL,
  message VARCHAR(1000) NOT NULL,
  action_tab VARCHAR(40) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_user_created (user_id, created_at),
  INDEX idx_notifications_user_unread (user_id, is_read),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_auth_tokens (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(32) NOT NULL,
  token_type ENUM('verify_email','reset_password') NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_auth_tokens_user_type (user_id, token_type),
  CONSTRAINT fk_auth_tokens_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS arrivals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  accommodation_id VARCHAR(32) NOT NULL,
  arrival_date DATE NOT NULL,
  visit_type ENUM('overnight','daytour') NOT NULL DEFAULT 'overnight',
  male_local INT NOT NULL DEFAULT 0,
  female_local INT NOT NULL DEFAULT 0,
  male_domestic INT NOT NULL DEFAULT 0,
  female_domestic INT NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_accommodation_date_type (accommodation_id, arrival_date, visit_type),
  CONSTRAINT fk_arrivals_accommodation FOREIGN KEY (accommodation_id)
    REFERENCES accommodations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS arrival_foreign_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  arrival_id INT NOT NULL,
  country VARCHAR(100) NOT NULL,
  male INT NOT NULL DEFAULT 0,
  female INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_foreign_arrival FOREIGN KEY (arrival_id)
    REFERENCES arrivals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

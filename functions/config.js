const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const axios = require('axios');
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');

const db = admin.firestore();

const TELEGRAM_BOT_TOKEN = functions.config()?.telegram?.bot_token;
const TELEGRAM_BOT_USERNAME = functions.config()?.telegram?.bot_username;

module.exports = { functions, admin, db, axios, ImapFlow, TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, nodemailer };

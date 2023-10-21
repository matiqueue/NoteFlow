const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const app = express()
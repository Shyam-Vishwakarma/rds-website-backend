const config = require('config')
const logger = require('../utils/logger')
const authService = require('../services/authService')
const users = require('../models/users')

/**
 * Middleware to validate the authenticated routes
 * 1] Verifies the token and adds user info to `req.userData` for further use
 * 2] In case of JWT expiry, adds a new JWT to the response if `currTime - tokenInitialisationTime <= refreshTtl`
 *
 * The currently implemented mechanism satisfies the current use case.
 * Authentication with JWT and a refreshToken to be added once we have user permissions and authorizations to be handled
 *
 * @todo: Add tests to assert on refreshed JWT generation by modifying the TTL values for the specific test. Currently not possible in the absence of a test-suite.
 *
 *
 * @param req {Object} - Express request object
 * @param res {Object} - Express response object
 * @param next {Function} - Express middleware function
 * @return {Object} - Returns unauthenticated object if token is invalid
 */
module.exports = async (req, res, next) => {
  try {
    const token = req.cookies[config.get('userToken.cookieName')]
    const decoded = authService.verifyAuthToken(token)

    // add user data to `req.userData` for further use
    req.userData = await users.fetchUser(decoded.userId)
    next()
  } catch (err) {
    logger.error(err)

    if (err.name === 'TokenExpiredError') {
      const refreshTtl = config.get('userToken.refreshTtl')
      const token = req.cookies[config.get('userToken.cookieName')]
      const decoded = authService.decodeAuthToken(token)
      const newToken = authService.generateAuthToken({ userId: decoded.userId })
      const rdsUiUrl = new URL(config.get('services.rdsUi.baseUrl'))

      // add new JWT to the response if it satisfies the refreshTtl time
      if (Math.floor(Date.now() / 1000) - decoded.iat <= refreshTtl) {
        res.cookie(config.get('userToken.cookieName'), newToken, {
          domain: rdsUiUrl.hostname,
          expires: new Date(Date.now() + config.get('userToken.ttl') * 1000),
          httpOnly: true,
          secure: true
        })

        // add user data to `req.userData` for further use
        req.userData = await users.fetchUser(decoded.userId)

        next()
      } else {
        return res.boom.unauthorized('Unauthenticated User')
      }
    } else {
      return res.boom.unauthorized('Unauthenticated User')
    }
  }
}

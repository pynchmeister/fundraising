const EVMScriptRegistryFactory = artifacts.require('EVMScriptRegistryFactory')
const DAOFactory = artifacts.require('DAOFactory')
const Kernel = artifacts.require('Kernel')
const ACL = artifacts.require('ACL')
const MiniMeToken = artifacts.require('MiniMeToken')
const Formula = artifacts.require('BancorFormula')
const TokenManager = artifacts.require('TokenManager')
const Vault = artifacts.require('Vault')
const Agent = artifacts.require('Agent')
const Presale = artifacts.require('PresaleMock')
const MarketMaker = artifacts.require('BatchedBancorMarketMaker')
const Tap = artifacts.require('Tap')
const Controller = artifacts.require('AragonFundraisingController')

const EtherTokenConstantMock = artifacts.require('EtherTokenConstantMock')
const TokenMock = artifacts.require('TokenMock')
const ForceSendETH = artifacts.require('ForceSendETH')

const { INITIAL_DAI_BALANCE } = require('./constants')

const {
  ANY_ADDRESS,
  ZERO_ADDRESS,
  VESTING_CLIFF_PERIOD,
  VESTING_COMPLETE_PERIOD,
  PRESALE_GOAL,
  PERCENT_SUPPLY_OFFERED,
  PRESALE_PERIOD,
  MAXIMUM_TAP_RATE_INCREASE_PCT,
  BLOCKS_IN_BATCH,
  SELL_FEE_PERCENT,
  BUY_FEE_PERCENT,
  PERCENT_FUNDING_FOR_BENEFICIARY,
  MARKET_MAKER_CONTROLLER_BATCH_BLOCKS,
  VIRTUAL_SUPPLIES,
  VIRTUAL_BALANCES,
  RESERVE_RATIOS,
  SLIPPAGES,
  RATES,
  FLOORS,
} = require('./constants')

const { hash } = require('eth-ens-namehash')
const { NULL_ADDRESS } = require('@ablack/fundraising-shared-test-helpers/addresses')
const getProxyAddress = receipt => receipt.logs.filter(l => l.event === 'NewAppProxy')[0].args.proxy

const setup = {
  ids: {
    tokenManager: hash('token-manager.aragonpm.eth'),
    vault: hash('vault.aragonpm.eth'),
    agent: hash('agent.aragonpm.eth'),
    presale: hash('presale.aragonpm.eth'),
    marketMaker: hash('batched-bancor-market-maker.aragonpm.eth'),
    tap: hash('tap.aragonpm.eth'),
    controller: hash('aragon-fundraising.aragonpm.eth'),
  },
  deploy: {
    factory: async ctx => {
      const kBase = await Kernel.new(true) // petrify immediately
      const aBase = await ACL.new()
      const rFact = await EVMScriptRegistryFactory.new()

      ctx.factory = await DAOFactory.new(kBase.address, aBase.address, rFact.address)
      ctx.roles.APP_MANAGER_ROLE = await kBase.APP_MANAGER_ROLE()
    },
    base: async ctx => {
      ctx.base = ctx.base || {}

      ctx.base.tokenManager = await TokenManager.new()
      ctx.base.vault = await Vault.new()
      ctx.base.reserve = await Agent.new()
      ctx.base.presale = await Presale.new()
      ctx.base.marketMaker = await MarketMaker.new()
      ctx.base.tap = await Tap.new()
      ctx.base.controller = await Controller.new()
    },
    formula: async ctx => {
      ctx.formula = await Formula.new()
    },
    collaterals: async (ctx, user) => {
      ctx.collaterals = ctx.collaterals || {}
      ctx.collaterals.dai = await TokenMock.new(user, INITIAL_DAI_BALANCE)
    },
    token: async (ctx, root) => {
      ctx.token = await MiniMeToken.new(NULL_ADDRESS, NULL_ADDRESS, 0, 'Bond', 18, 'BON', false, { from: root })
    },
    dao: async (ctx, root) => {
      const receipt = await ctx.factory.newDAO(root)

      ctx.dao = Kernel.at(receipt.logs.filter(l => l.event === 'DeployDAO')[0].args.dao)
      ctx.acl = ACL.at(await ctx.dao.acl())

      await ctx.acl.createPermission(root, ctx.dao.address, ctx.roles.APP_MANAGER_ROLE, root, { from: root })
    },
    infrastructure: async ctx => {
      ctx.roles = ctx.roles || {}

      await setup.deploy.factory(ctx)
      await setup.deploy.base(ctx)
      await setup.deploy.formula(ctx)
    },
    organization: async (ctx, root, user) => {
      await setup.deploy.collaterals(ctx, user)
      await setup.deploy.token(ctx, root)
      await setup.deploy.dao(ctx, root)
      await setup.install.all(ctx, root)
      await setup.initialize.all(ctx, root, user)
      await setup.setPermissions.all(ctx, root, user)
      await setup.setCollaterals(ctx, root, user)
    },
  },
  install: {
    tokenManager: async (ctx, root) => {
      const receipt = await ctx.dao.newAppInstance(setup.ids.tokenManager, ctx.base.tokenManager.address, '0x', false, { from: root })

      ctx.tokenManager = await TokenManager.at(getProxyAddress(receipt))
    },
    vault: async (ctx, root) => {
      const receipt = await ctx.dao.newAppInstance(setup.ids.vault, ctx.base.vault.address, '0x', false, { from: root })

      ctx.vault = await Vault.at(getProxyAddress(receipt))
    },
    reserve: async (ctx, root) => {
      const receipt = await ctx.dao.newAppInstance(setup.ids.agent, ctx.base.reserve.address, '0x', false, { from: root })

      ctx.reserve = await Agent.at(getProxyAddress(receipt))
    },
    presale: async (ctx, root) => {
      const receipt = await ctx.dao.newAppInstance(setup.ids.presale, ctx.base.presale.address, '0x', false, { from: root })

      ctx.presale = await Presale.at(getProxyAddress(receipt))
    },
    marketMaker: async (ctx, root) => {
      const receipt = await ctx.dao.newAppInstance(setup.ids.marketMaker, ctx.base.marketMaker.address, '0x', false, { from: root })

      ctx.marketMaker = await MarketMaker.at(getProxyAddress(receipt))
    },
    tap: async (ctx, root) => {
      const receipt = await ctx.dao.newAppInstance(setup.ids.tap, ctx.base.tap.address, '0x', false, { from: root })

      ctx.tap = await Tap.at(getProxyAddress(receipt))
    },
    controller: async (ctx, root) => {
      const receipt = await ctx.dao.newAppInstance(setup.ids.controller, ctx.base.controller.address, '0x', false, { from: root })

      ctx.controller = await Controller.at(getProxyAddress(receipt))
    },
    all: async (ctx, root) => {
      await setup.install.tokenManager(ctx, root)
      await setup.install.vault(ctx, root)
      await setup.install.reserve(ctx, root)
      await setup.install.presale(ctx, root)
      await setup.install.marketMaker(ctx, root)
      await setup.install.tap(ctx, root)
      await setup.install.controller(ctx, root)
    },
  },
  initialize: {
    tokenManager: async (ctx, root) => {
      await ctx.token.changeController(ctx.tokenManager.address, { from: root })
      await ctx.tokenManager.initialize(ctx.token.address, true, 0, { from: root })
    },
    vault: async (ctx, root) => {
      await ctx.vault.initialize({ from: root })
    },
    reserve: async (ctx, root) => {
      await ctx.reserve.initialize({ from: root })
    },
    presale: async (ctx, root) => {
      await ctx.presale.initialize(
        ctx.controller.address,
        ctx.collaterals.dai.address,
        ctx.token.address,
        ctx.tokenManager.address,
        VESTING_CLIFF_PERIOD,
        VESTING_COMPLETE_PERIOD,
        PRESALE_GOAL,
        PERCENT_SUPPLY_OFFERED,
        PRESALE_PERIOD,
        ctx.reserve.address,
        ctx.vault.address,
        PERCENT_FUNDING_FOR_BENEFICIARY,
        0,
        [ctx.collaterals.dai.address],
        { from: root }
      )
    },
    marketMaker: async (ctx, root) => {
      await ctx.marketMaker.initialize(
        ctx.controller.address,
        ctx.tokenManager.address,
        ctx.reserve.address,
        ctx.vault.address,
        ctx.formula.address,
        BLOCKS_IN_BATCH,
        BUY_FEE_PERCENT,
        SELL_FEE_PERCENT,
        { from: root }
      )
    },
    tap: async (ctx, root) => {
      await ctx.tap.initialize(ctx.controller.address, ctx.reserve.address, ctx.vault.address, BLOCKS_IN_BATCH, MAXIMUM_TAP_RATE_INCREASE_PCT, { from: root })
    },
    controller: async (ctx, root) => {
      await ctx.controller.initialize(ctx.presale.address, ctx.marketMaker.address, ctx.reserve.address, ctx.tap.address, { from: root })
    },
    all: async (ctx, root, user) => {
      await setup.initialize.tokenManager(ctx, root)
      await setup.initialize.vault(ctx, root)
      await setup.initialize.reserve(ctx, root)
      await setup.initialize.presale(ctx, root)
      await setup.initialize.marketMaker(ctx, root)
      await setup.initialize.tap(ctx, root)
      await setup.initialize.controller(ctx, root)
    },
  },
  setPermissions: {
    tokenManager: async (ctx, root) => {
      ctx.roles.tokenManager = ctx.roles.tokenManager || {}
      ctx.roles.tokenManager.MINT_ROLE = await ctx.base.tokenManager.MINT_ROLE()
      ctx.roles.tokenManager.BURN_ROLE = await ctx.base.tokenManager.BURN_ROLE()
      ctx.roles.tokenManager.ISSUE_ROLE = await ctx.base.tokenManager.ISSUE_ROLE()
      ctx.roles.tokenManager.ASSIGN_ROLE = await ctx.base.tokenManager.ASSIGN_ROLE()
      ctx.roles.tokenManager.REVOKE_VESTINGS_ROLE = await ctx.base.tokenManager.REVOKE_VESTINGS_ROLE()

      await ctx.acl.createPermission(ctx.marketMaker.address, ctx.tokenManager.address, ctx.roles.tokenManager.MINT_ROLE, root, { from: root })
      await ctx.acl.createPermission(ctx.marketMaker.address, ctx.tokenManager.address, ctx.roles.tokenManager.BURN_ROLE, root, { from: root })
      await ctx.acl.grantPermission(ctx.presale.address, ctx.tokenManager.address, ctx.roles.tokenManager.BURN_ROLE, { from: root })
      await ctx.acl.createPermission(ctx.presale.address, ctx.tokenManager.address, ctx.roles.tokenManager.ISSUE_ROLE, root, { from: root })
      await ctx.acl.createPermission(ctx.presale.address, ctx.tokenManager.address, ctx.roles.tokenManager.ASSIGN_ROLE, root, { from: root })
      await ctx.acl.createPermission(ctx.presale.address, ctx.tokenManager.address, ctx.roles.tokenManager.REVOKE_VESTINGS_ROLE, root, { from: root })
    },
    vault: async (ctx, root) => {},
    reserve: async (ctx, root) => {
      ctx.roles.reserve = ctx.roles.reserve || {}
      ctx.roles.reserve.ADD_PROTECTED_TOKEN_ROLE = await ctx.base.reserve.ADD_PROTECTED_TOKEN_ROLE()
      ctx.roles.reserve.TRANSFER_ROLE = await ctx.base.reserve.TRANSFER_ROLE()

      await ctx.acl.createPermission(ctx.marketMaker.address, ctx.reserve.address, ctx.roles.reserve.TRANSFER_ROLE, root, { from: root })
      await ctx.acl.grantPermission(ctx.tap.address, ctx.reserve.address, ctx.roles.reserve.TRANSFER_ROLE, { from: root })
      await ctx.acl.createPermission(ctx.controller.address, ctx.reserve.address, ctx.roles.reserve.ADD_PROTECTED_TOKEN_ROLE, root, { from: root })
    },
    presale: async (ctx, root) => {
      ctx.roles.presale = ctx.roles.presale || {}
      ctx.roles.presale.OPEN_ROLE = await ctx.base.presale.OPEN_ROLE()
      ctx.roles.presale.CONTRIBUTE_ROLE = await ctx.base.presale.CONTRIBUTE_ROLE()

      await ctx.acl.createPermission(ctx.controller.address, ctx.presale.address, ctx.roles.presale.OPEN_ROLE, root, { from: root })
      await ctx.acl.createPermission(ctx.controller.address, ctx.presale.address, ctx.roles.presale.CONTRIBUTE_ROLE, root, { from: root })
    },
    marketMaker: async (ctx, root) => {
      ctx.roles.marketMaker = ctx.roles.marketMaker || {}
      ctx.roles.marketMaker.OPEN_ROLE = await ctx.base.marketMaker.OPEN_ROLE()
      ctx.roles.marketMaker.UPDATE_BENEFICIARY_ROLE = await ctx.base.marketMaker.UPDATE_BENEFICIARY_ROLE()
      ctx.roles.marketMaker.UPDATE_FEES_ROLE = await ctx.base.marketMaker.UPDATE_FEES_ROLE()
      ctx.roles.marketMaker.ADD_COLLATERAL_TOKEN_ROLE = await ctx.base.marketMaker.ADD_COLLATERAL_TOKEN_ROLE()
      ctx.roles.marketMaker.REMOVE_COLLATERAL_TOKEN_ROLE = await ctx.base.marketMaker.REMOVE_COLLATERAL_TOKEN_ROLE()
      ctx.roles.marketMaker.UPDATE_COLLATERAL_TOKEN_ROLE = await ctx.base.marketMaker.UPDATE_COLLATERAL_TOKEN_ROLE()
      ctx.roles.marketMaker.OPEN_BUY_ORDER_ROLE = await ctx.base.marketMaker.OPEN_BUY_ORDER_ROLE()
      ctx.roles.marketMaker.OPEN_SELL_ORDER_ROLE = await ctx.base.marketMaker.OPEN_SELL_ORDER_ROLE()

      await ctx.acl.createPermission(ctx.controller.address, ctx.marketMaker.address, ctx.roles.marketMaker.OPEN_ROLE, root, { from: root })
      await ctx.acl.createPermission(ctx.controller.address, ctx.marketMaker.address, ctx.roles.marketMaker.UPDATE_BENEFICIARY_ROLE, root, { from: root })
      await ctx.acl.createPermission(ctx.controller.address, ctx.marketMaker.address, ctx.roles.marketMaker.UPDATE_FEES_ROLE, root, { from: root })
      await ctx.acl.createPermission(ctx.controller.address, ctx.marketMaker.address, ctx.roles.marketMaker.ADD_COLLATERAL_TOKEN_ROLE, root, {
        from: root,
      })
      await ctx.acl.createPermission(ctx.controller.address, ctx.marketMaker.address, ctx.roles.marketMaker.REMOVE_COLLATERAL_TOKEN_ROLE, root, {
        from: root,
      })
      await ctx.acl.createPermission(ctx.controller.address, ctx.marketMaker.address, ctx.roles.marketMaker.UPDATE_COLLATERAL_TOKEN_ROLE, root, {
        from: root,
      })
      await ctx.acl.createPermission(ctx.controller.address, ctx.marketMaker.address, ctx.roles.marketMaker.OPEN_BUY_ORDER_ROLE, root, { from: root })
      await ctx.acl.createPermission(ctx.controller.address, ctx.marketMaker.address, ctx.roles.marketMaker.OPEN_SELL_ORDER_ROLE, root, { from: root })
    },
    tap: async (ctx, root) => {
      ctx.roles.tap = ctx.roles.tap || {}
      ctx.roles.tap.UPDATE_BENEFICIARY_ROLE = await ctx.base.tap.UPDATE_BENEFICIARY_ROLE()
      ctx.roles.tap.ADD_TAPPED_TOKEN_ROLE = await ctx.base.tap.ADD_TAPPED_TOKEN_ROLE()
      ctx.roles.tap.UPDATE_TAPPED_TOKEN_ROLE = await ctx.base.tap.UPDATE_TAPPED_TOKEN_ROLE()
      ctx.roles.tap.RESET_TAPPED_TOKEN_ROLE = await ctx.base.tap.RESET_TAPPED_TOKEN_ROLE()
      ctx.roles.tap.UPDATE_MAXIMUM_TAP_RATE_INCREASE_PCT_ROLE = await ctx.base.tap.UPDATE_MAXIMUM_TAP_RATE_INCREASE_PCT_ROLE()
      ctx.roles.tap.WITHDRAW_ROLE = await ctx.base.tap.WITHDRAW_ROLE()

      await ctx.acl.createPermission(ctx.controller.address, ctx.tap.address, ctx.roles.tap.UPDATE_BENEFICIARY_ROLE, root, { from: root })
      await ctx.acl.createPermission(ctx.controller.address, ctx.tap.address, ctx.roles.tap.ADD_TAPPED_TOKEN_ROLE, root, { from: root })
      await ctx.acl.createPermission(ctx.controller.address, ctx.tap.address, ctx.roles.tap.RESET_TAPPED_TOKEN_ROLE, root, { from: root })
      await ctx.acl.createPermission(ctx.controller.address, ctx.tap.address, ctx.roles.tap.UPDATE_TAPPED_TOKEN_ROLE, root, { from: root })
      await ctx.acl.createPermission(ctx.controller.address, ctx.tap.address, ctx.roles.tap.UPDATE_MAXIMUM_TAP_RATE_INCREASE_PCT_ROLE, root, {
        from: root,
      })
      await ctx.acl.createPermission(ctx.controller.address, ctx.tap.address, ctx.roles.tap.WITHDRAW_ROLE, root, { from: root })
    },
    controller: async (ctx, root, user) => {
      ctx.roles.controller = ctx.roles.controller || {}
      ctx.roles.controller.UPDATE_BENEFICIARY_ROLE = await ctx.base.controller.UPDATE_BENEFICIARY_ROLE()
      ctx.roles.controller.UPDATE_FEES_ROLE = await ctx.base.controller.UPDATE_FEES_ROLE()
      ctx.roles.controller.UPDATE_MAXIMUM_TAP_RATE_INCREASE_PCT_ROLE = await ctx.base.controller.UPDATE_MAXIMUM_TAP_RATE_INCREASE_PCT_ROLE()
      ctx.roles.controller.ADD_COLLATERAL_TOKEN_ROLE = await ctx.base.controller.ADD_COLLATERAL_TOKEN_ROLE()
      ctx.roles.controller.REMOVE_COLLATERAL_TOKEN_ROLE = await ctx.base.controller.REMOVE_COLLATERAL_TOKEN_ROLE()
      ctx.roles.controller.UPDATE_COLLATERAL_TOKEN_ROLE = await ctx.base.controller.UPDATE_COLLATERAL_TOKEN_ROLE()
      ctx.roles.controller.UPDATE_TOKEN_TAP_ROLE = await ctx.base.controller.UPDATE_TOKEN_TAP_ROLE()
      ctx.roles.controller.RESET_TOKEN_TAP_ROLE = await ctx.base.controller.RESET_TOKEN_TAP_ROLE()
      ctx.roles.controller.OPEN_PRESALE_ROLE = await ctx.base.controller.OPEN_PRESALE_ROLE()
      ctx.roles.controller.OPEN_CAMPAIGN_ROLE = await ctx.base.controller.OPEN_CAMPAIGN_ROLE()
      ctx.roles.controller.CONTRIBUTE_ROLE = await ctx.base.controller.CONTRIBUTE_ROLE()
      ctx.roles.controller.OPEN_BUY_ORDER_ROLE = await ctx.base.controller.OPEN_BUY_ORDER_ROLE()
      ctx.roles.controller.OPEN_SELL_ORDER_ROLE = await ctx.base.controller.OPEN_SELL_ORDER_ROLE()
      ctx.roles.controller.WITHDRAW_ROLE = await ctx.base.controller.WITHDRAW_ROLE()

      await ctx.acl.createPermission(user, ctx.controller.address, ctx.roles.controller.UPDATE_BENEFICIARY_ROLE, root, { from: root })
      await ctx.acl.createPermission(user, ctx.controller.address, ctx.roles.controller.UPDATE_FEES_ROLE, root, { from: root })
      await ctx.acl.createPermission(user, ctx.controller.address, ctx.roles.controller.UPDATE_MAXIMUM_TAP_RATE_INCREASE_PCT_ROLE, root, { from: root })
      await ctx.acl.createPermission(user, ctx.controller.address, ctx.roles.controller.ADD_COLLATERAL_TOKEN_ROLE, root, { from: root })
      await ctx.acl.grantPermission(root, ctx.controller.address, ctx.roles.controller.ADD_COLLATERAL_TOKEN_ROLE, { from: root }) // for tests purposes only
      await ctx.acl.createPermission(user, ctx.controller.address, ctx.roles.controller.REMOVE_COLLATERAL_TOKEN_ROLE, root, { from: root })
      await ctx.acl.createPermission(user, ctx.controller.address, ctx.roles.controller.UPDATE_COLLATERAL_TOKEN_ROLE, root, { from: root })
      await ctx.acl.createPermission(user, ctx.controller.address, ctx.roles.controller.UPDATE_TOKEN_TAP_ROLE, root, { from: root })
      await ctx.acl.createPermission(ctx.presale.address, ctx.controller.address, ctx.roles.controller.RESET_TOKEN_TAP_ROLE, root, { from: root })
      await ctx.acl.createPermission(user, ctx.controller.address, ctx.roles.controller.OPEN_PRESALE_ROLE, root, { from: root })
      await ctx.acl.createPermission(ctx.presale.address, ctx.controller.address, ctx.roles.controller.OPEN_CAMPAIGN_ROLE, root, { from: root })
      await ctx.acl.createPermission(user, ctx.controller.address, ctx.roles.controller.CONTRIBUTE_ROLE, root, { from: root })
      await ctx.acl.createPermission(user, ctx.controller.address, ctx.roles.controller.OPEN_BUY_ORDER_ROLE, root, { from: root })
      await ctx.acl.createPermission(user, ctx.controller.address, ctx.roles.controller.OPEN_SELL_ORDER_ROLE, root, { from: root })
      await ctx.acl.createPermission(user, ctx.controller.address, ctx.roles.controller.WITHDRAW_ROLE, root, { from: root })
    },
    all: async (ctx, root, user) => {
      await setup.setPermissions.tokenManager(ctx, root)
      await setup.setPermissions.vault(ctx, root)
      await setup.setPermissions.reserve(ctx, root)
      await setup.setPermissions.presale(ctx, root)
      await setup.setPermissions.marketMaker(ctx, root)
      await setup.setPermissions.tap(ctx, root)
      await setup.setPermissions.controller(ctx, root, user)
    },
  },
  setCollaterals: async (ctx, root, user) => {
    await ctx.collaterals.dai.approve(ctx.presale.address, INITIAL_DAI_BALANCE, { from: user })
    await ctx.collaterals.dai.approve(ctx.marketMaker.address, INITIAL_DAI_BALANCE, { from: user })

    await ctx.controller.addCollateralToken(
      ctx.collaterals.dai.address,
      VIRTUAL_SUPPLIES[0],
      VIRTUAL_BALANCES[0],
      RESERVE_RATIOS[0],
      SLIPPAGES[0],
      RATES[0],
      FLOORS[0],
      {
        from: root,
      }
    )
  },
}

module.exports = setup

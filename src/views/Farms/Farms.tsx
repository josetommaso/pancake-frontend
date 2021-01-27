import React, { useEffect, useCallback, useState, useRef } from 'react'
import { Route, useRouteMatch, useLocation } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import BigNumber from 'bignumber.js'
import { useWallet } from '@binance-chain/bsc-use-wallet'
import { provider } from 'web3-core'
import { Image, Heading } from '@pancakeswap-libs/uikit'
import styled from 'styled-components'
import { BLOCKS_PER_YEAR, CAKE_PER_BLOCK, CAKE_POOL_PID } from 'config'
import FlexLayout from 'components/layout/Flex'
import Page from 'components/layout/Page'
import { useFarms, usePriceBnbBusd, usePriceCakeBusd } from 'state/hooks'
import useRefresh from 'hooks/useRefresh'
import { fetchFarmUserDataAsync } from 'state/actions'
import { QuoteToken } from 'config/constants/types'
import useI18n from 'hooks/useI18n'
import { getBalanceNumber } from 'utils/formatBalance'
import getLiquidityUrlPathParts from 'utils/getLiquidityUrlPathParts'
import FarmCard, { FarmWithStakedValue } from './components/FarmCard/FarmCard'
import Table from './components/Table/Table'
import FarmTabButtons from './components/FarmTabButtons'
import Divider from './components/Divider'
import SearchInput from './components/SearchInput'
import { RowData } from './components/Table/Row'

const ControlContainer = styled.div`
  display: flex;
  width: 100%;
  align-items: center;
  margin-bottom: 2rem;
  padding: 0rem 1.5rem;
`

const Farms: React.FC = () => {
  const { path } = useRouteMatch()
  const { pathname } = useLocation()
  const TranslateString = useI18n()
  const farmsLP = useFarms()
  const cakePrice = usePriceCakeBusd()
  const bnbPrice = usePriceBnbBusd()
  const [query, setQuery] = useState('')
  const { account, ethereum }: { account: string; ethereum: provider } = useWallet()

  const dispatch = useDispatch()
  const { fastRefresh } = useRefresh()
  useEffect(() => {
    if (account) {
      dispatch(fetchFarmUserDataAsync(account))
    }
  }, [account, dispatch, fastRefresh])

  const activeFarms = farmsLP.filter((farm) => farm.pid !== 0 && farm.multiplier !== '0X')
  const inactiveFarms = farmsLP.filter((farm) => farm.pid !== 0 && farm.multiplier === '0X')

  const tableRef = useRef(null)

  // /!\ This function will be removed soon
  // This function compute the APY for each farm and will be replaced when we have a reliable API
  // to retrieve assets prices against USD
  const farmsList = useCallback(
    (farmsToDisplay): FarmWithStakedValue[] => {
      const cakePriceVsBNB = new BigNumber(farmsLP.find((farm) => farm.pid === CAKE_POOL_PID)?.tokenPriceVsQuote || 0)
      const farmsToDisplayWithAPY: FarmWithStakedValue[] = farmsToDisplay.map((farm) => {
        if (!farm.tokenAmount || !farm.lpTotalInQuoteToken || !farm.lpTotalInQuoteToken) {
          return farm
        }
        const cakeRewardPerBlock = CAKE_PER_BLOCK.times(farm.poolWeight)
        const cakeRewardPerYear = cakeRewardPerBlock.times(BLOCKS_PER_YEAR)

        let apy = cakePriceVsBNB.times(cakeRewardPerYear).div(farm.lpTotalInQuoteToken)

        if (farm.quoteTokenSymbol === QuoteToken.BUSD || farm.quoteTokenSymbol === QuoteToken.UST) {
          apy = cakePriceVsBNB.times(cakeRewardPerYear).div(farm.lpTotalInQuoteToken).times(bnbPrice)
        } else if (farm.quoteTokenSymbol === QuoteToken.CAKE) {
          apy = cakeRewardPerYear.div(farm.lpTotalInQuoteToken)
        } else if (farm.dual) {
          const cakeApy =
            farm && cakePriceVsBNB.times(cakeRewardPerBlock).times(BLOCKS_PER_YEAR).div(farm.lpTotalInQuoteToken)
          const dualApy =
            farm.tokenPriceVsQuote &&
            new BigNumber(farm.tokenPriceVsQuote)
              .times(farm.dual.rewardPerBlock)
              .times(BLOCKS_PER_YEAR)
              .div(farm.lpTotalInQuoteToken)

          apy = cakeApy && dualApy && cakeApy.plus(dualApy)
        }

        return { ...farm, apy }
      })

      return farmsToDisplayWithAPY
    },
    [bnbPrice, farmsLP],
  )

  const handleChangeValue = (event: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value)
    if (tableRef.current) {
      tableRef.current.setTableQuery(event.target.value)
    }
  }

  const isActive = !pathname.includes('history')
  let farmsStaked = []
  if (isActive) {
    farmsStaked = farmsList(activeFarms)
  } else {
    farmsStaked = farmsList(inactiveFarms)
  }

  const rowData = farmsStaked.map((farm) => {
    let totalValue = farm.lpTotalInQuoteToken

    if (!farm.lpTotalInQuoteToken) {
      totalValue = null
    }
    if (farm.quoteTokenSymbol === QuoteToken.BNB) {
      totalValue = bnbPrice.times(farm.lpTotalInQuoteToken)
    }
    if (farm.quoteTokenSymbol === QuoteToken.CAKE) {
      totalValue = cakePrice.times(farm.lpTotalInQuoteToken)
    }

    const { quoteTokenAdresses, quoteTokenSymbol, tokenAddresses } = farm

    const row: RowData = {
      apy: {
        value: farm.apy
          ? Number(`${farm.apy.times(new BigNumber(100)).toNumber().toLocaleString('en-US').slice(0, -1)}`)
          : null,
        multiplier: farm.multiplier,
      },
      pool: {
        image: farm.lpSymbol.split(' ')[0].toLocaleLowerCase(),
        label: farm.lpSymbol && farm.lpSymbol.toUpperCase().replace('PANCAKE', ''),
      },
      earned: {
        earnings: farm.userData ? getBalanceNumber(new BigNumber(farm.userData.earnings)) : null,
        pid: farm.pid,
      },
      staked: farm,
      details: {
        liquidity: Number(totalValue),
        lpName: farm.lpSymbol.toUpperCase(),
        liquidityUrlPathParts: getLiquidityUrlPathParts({ quoteTokenAdresses, quoteTokenSymbol, tokenAddresses }),
      },
      links: {
        bsc: `https://bscscan.com/address/${farm.lpAddresses[process.env.REACT_APP_CHAIN_ID]}`,
      },
    }

    return row
  })

  return (
    <Page>
      <Heading as="h1" size="lg" color="secondary" mb="50px" style={{ textAlign: 'center' }}>
        {TranslateString(999, 'Stake LP tokens to earn CAKE')}
      </Heading>
      <ControlContainer>
        <FarmTabButtons />
        <SearchInput onChange={handleChangeValue} value={query} />
      </ControlContainer>

      <Table data={rowData} ref={tableRef} />
      <div>
        <Divider />
        <FlexLayout>
          <Route exact path={`${path}`}>
            {farmsStaked.map((farm) => (
              <FarmCard
                key={farm.pid}
                farm={farm}
                bnbPrice={bnbPrice}
                cakePrice={cakePrice}
                ethereum={ethereum}
                account={account}
                removed={false}
              />
            ))}
          </Route>
          <Route exact path={`${path}/history`}>
            {farmsStaked.map((farm) => (
              <FarmCard
                key={farm.pid}
                farm={farm}
                bnbPrice={bnbPrice}
                cakePrice={cakePrice}
                ethereum={ethereum}
                account={account}
                removed
              />
            ))}
          </Route>
        </FlexLayout>
      </div>
      <Image src="/images/cakecat.png" alt="Pancake illustration" width={949} height={384} responsive />
    </Page>
  )
}

export default Farms

import type { CategoryId } from './types'

/** Narration keywords for debits, checked after the merchant dictionary. First match wins. */
export const DEBIT_KEYWORDS: [RegExp, CategoryId][] = [
  [/\bRENT\b|\bHOUSE RENT\b|\bPG RENT\b|\bPG\b|MAINTENANCE|\bSOCIETY\b|\bAPARTMENT\b|\bLANDLORD\b|\bBROKERAGE\b/, 'rent'],
  [/\bEMI\b|\bLOAN\b|\bFINANCE\b|\bFINSERV\b|\bHOME FIN|\bHOUSING FIN/, 'emi'],
  [/INSURANCE|\bPOLICY\b|\bPREMIUM\b/, 'insurance'],
  [/\bSCHOOL\b|\bCOLLEGE\b|\bUNIVERSITY\b|\bTUITION\b|\bCOACHING\b|\bACADEMY\b|\bCLASSES\b|\bEXAM FEE|\bCOURSE\b/, 'education'],
  [/\bHOSPITAL\b|\bCLINIC\b|\bPHARMA|\bMEDICAL|\bMEDICOS\b|\bCHEMIST\b|\bDIAGNOSTIC|\bPATH ?LAB|\bDENTAL\b|\bDOCTOR\b|\bGYM\b|\bFITNESS\b|\bYOGA\b/, 'health'],
  [/\bRESTAURANT\b|\bCAFE\b|\bDHABA\b|\bBAKERY\b|\bBAKERS\b|\bSWEETS\b|\bFOOD\b|\bFOODS\b|\bKITCHEN\b|\bBIRYANI\b|\bPIZZA\b|\bBURGER\b|\bTEA\b|\bCHAI\b|\bJUICE\b|\bHOTEL\b/, 'food'],
  [/\bKIRANA\b|\bGENERAL STORE|\bPROVISION|\bSUPERMARKET\b|\bSUPER MARKET\b|\bGROCER|\bVEGETABLE|\bFRUITS?\b|\bDAIRY\b|\bMILK\b|\bMART\b/, 'groceries'],
  [/\bELECTRICITY\b|\bPOWER\b|\bWATER\b|\bGAS\b|\bBROADBAND\b|\bFIBER\b|\bFIBRE\b|\bPOSTPAID\b|\bPREPAID\b|\bRECHARGE\b|\bDTH\b|\bBILLPAY\b|\bBILL PAY\b|\bBBPS\b/, 'bills'],
  [/\bPETROL\b|\bFUEL\b|\bFILLING\b|\bDIESEL\b|\bCNG\b|\bPARKING\b|\bTOLL\b|\bCAB\b|\bTAXI\b|\bTRAVELS?\b|\bTOURS?\b|\bAIRLINES?\b|\bRAILWAY\b|\bBUS\b/, 'travel'],
  [/\bSUBSCRIPTION\b|\bMEMBERSHIP\b|\bRENEWAL\b/, 'subscriptions'],
  [/\bFASHION|\bCLOTH|\bGARMENT|\bFOOTWEAR\b|\bSHOES\b|\bELECTRONICS\b|\bMOBILES?\b|\bJEWELL|\bSTORE\b|\bSTORES\b|\bTRADERS?\b|\bENTERPRISES?\b|\bBOUTIQUE\b|\bSALON\b|\bSPA\b/, 'shopping'],
]

export const INVESTMENT_RE =
  /\bSIP\b|MUTUAL FUND|\bMF\b|\bNPS\b|\bPPF\b|SUKANYA|\bSSY\b|\bRD\b INST|\bELSS\b|\bSGB\b|SOVEREIGN GOLD|\bSTOCK BROK|\bDEMAT\b|\bTRADING A\/?C\b|\bAPY\b/

export const CARD_BILL_RE =
  /CREDIT CARD|\bCC ?PAY|\bCC \d|\bCARD ?BILL|\bCCBILL|CARD PAYMENT|\bCC 0+\d|\bBILLDESK\b.*\bCARD\b|\bAUTOPAY SI-?TAD\b|\bSI-?TAD\b|\bSI-?MAD\b/

export const LOAN_RE = /LOAN|\bEMI\b|FINANCE|FINSERV|CAPITAL|CREDIT|\bHDB\b|\bHFC\b|LENDING|HOUSING/

export const REFUND_RE = /REFUND|REVERSAL|\bREV\b|\bREV-|REVERSED|\bRFND\b|CASHBACK|CASH BACK|\bRET\b|CHARGEBACK/

export const SALARY_RE = /SALARY|\bSAL\b|SAL CREDIT|PAYROLL|\bSAL FOR\b|STIPEND/

export const INTEREST_RE = /INT\.?\s?PD|\bINTEREST\b|INT\.\s?CREDIT|\bSB INT\b|\bINT CR\b|CREDIT INTEREST/

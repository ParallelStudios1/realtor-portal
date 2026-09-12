import React from 'react';
import { Text, View, Linking } from 'react-native';

/**
 * FMLS-required statements, shown under any FMLS-sourced listing display:
 * technical provider identity + contact, IDRBNG, DMCA takedown link,
 * © [year] FMLS. Mirror of the web FmlsDisclaimer component.
 */
export function FmlsDisclaimer({
  textColor,
  borderColor,
}: {
  textColor: string;
  borderColor: string;
}) {
  const year = new Date().getFullYear();
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: borderColor,
        marginTop: 16,
        paddingTop: 12,
      }}
    >
      <Text style={{ color: textColor, fontSize: 11, lineHeight: 16 }}>
        FMLS listing data functionality is provided and supported by Parallel
        Studios LLC · turnerlogan@parallelstudios.co · (678) 822-6564.
      </Text>
      <Text
        style={{ color: textColor, fontSize: 11, lineHeight: 16, marginTop: 6 }}
      >
        Information Deemed Reliable But Not Guaranteed. If you believe any FMLS
        listing contains material that infringes your copyrighted work please{' '}
        <Text
          style={{ fontWeight: '700', textDecorationLine: 'underline' }}
          onPress={() => Linking.openURL('https://www.fmls.com/dmca.htm')}
        >
          click here
        </Text>{' '}
        to review our DMCA policy and learn how to submit a takedown request. ©{' '}
        {year} FMLS.
      </Text>
    </View>
  );
}
